"""
nlp/pdf_parser.py
─────────────────
Extracts text from PDF documents using multiple PDF parsing engines in order:
  1. PyMuPDF (fitz)
  2. pdfplumber
  3. pdfminer.six

If the text extracted is blank or extremely sparse, it automatically runs OCR using pytesseract.
"""

from __future__ import annotations

import io
import os
import logging

logger = logging.getLogger(__name__)

def extract_text_from_pdf(pdf_bytes: bytes, filename: str = "") -> tuple[str, bool, int]:
    """
    Extract readable text from PDF bytes.
    
    Parameters
    ----------
    pdf_bytes : bytes
        The binary content of the PDF file.
    filename : str, optional
        Filename used for logging/debugging.
        
    Returns
    -------
    tuple[str, bool, int]
        (extracted_text, ocr_run, page_count)
    """
    extracted_text = ""
    page_count = 0
    ocr_run = False
    
    # 1. Attempt PyMuPDF (fitz)
    try:
        import fitz
        logger.info("PDF Parser: Attempting PyMuPDF for %s", filename)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        extracted_text = "\n".join(text_parts).strip()
        logger.info("PDF Parser: PyMuPDF success. Extracted %d chars across %d pages.", len(extracted_text), page_count)
    except Exception as e:
        logger.warning("PDF Parser: PyMuPDF failed or not installed: %s. Trying fallbacks.", e)

    # 2. Attempt pdfplumber fallback if PyMuPDF failed or returned nothing
    if not extracted_text:
        try:
            import pdfplumber
            logger.info("PDF Parser: Attempting pdfplumber for %s", filename)
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                page_count = len(pdf.pages)
                text_parts = []
                for page in pdf.pages:
                    txt = page.extract_text()
                    if txt:
                        text_parts.append(txt)
                extracted_text = "\n".join(text_parts).strip()
                logger.info("PDF Parser: pdfplumber success. Extracted %d chars across %d pages.", len(extracted_text), page_count)
        except Exception as e:
            logger.warning("PDF Parser: pdfplumber failed: %s. Trying pdfminer.six.", e)

    # 2.5 Attempt pypdf fallback if still empty
    if not extracted_text:
        try:
            from pypdf import PdfReader
            logger.info("PDF Parser: Attempting pypdf for %s", filename)
            reader = PdfReader(io.BytesIO(pdf_bytes))
            page_count = len(reader.pages)
            text_parts = []
            for page in reader.pages:
                txt = page.extract_text()
                if txt:
                    text_parts.append(txt)
            extracted_text = "\n".join(text_parts).strip()
            logger.info("PDF Parser: pypdf success. Extracted %d chars across %d pages.", len(extracted_text), page_count)
        except Exception as e:
            logger.warning("PDF Parser: pypdf failed: %s. Trying pdfminer.six.", e)

    # 3. Attempt pdfminer.six fallback if still empty
    if not extracted_text:
        try:
            from pdfminer.high_level import extract_text
            logger.info("PDF Parser: Attempting pdfminer.six for %s", filename)
            extracted_text = extract_text(io.BytesIO(pdf_bytes)).strip()
            # pdfminer doesn't easily expose page count directly, approximate it
            page_count = max(1, extracted_text.count("\f") + 1)
            logger.info("PDF Parser: pdfminer.six success. Extracted %d chars.", len(extracted_text))
        except Exception as e:
            logger.warning("PDF Parser: pdfminer.six failed: %s.", e)

    # Detect if scanned PDF (e.g. less than 30 characters per page or less than 40 chars total)
    is_scanned = False
    if page_count > 0:
        is_scanned = len(extracted_text) < (page_count * 30) or len(extracted_text) < 40
    else:
        is_scanned = len(extracted_text) < 40

    # 4. Trigger OCR if PDF appears scanned
    if is_scanned:
        logger.info("PDF Parser: PDF %s appears to be a scanned image document. Triggering OCR...", filename)
        try:
            import fitz  # Need PyMuPDF to render pages
            from PIL import Image
            import pytesseract
            
            # Setup Tesseract command path for Windows UB-Mannheim default install directory
            tesseract_default_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
            if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
                if os.path.exists(tesseract_default_path):
                    pytesseract.pytesseract.tesseract_cmd = tesseract_default_path
                    logger.info("PDF Parser: Configured Tesseract path: %s", tesseract_default_path)
            
            # Test if Tesseract binary is actually executable/responsive
            try:
                pytesseract.get_tesseract_version()
            except Exception as cmd_err:
                raise RuntimeError(
                    "Tesseract OCR engine is not installed or not in PATH. "
                    "Please run 'winget install tesseract-ocr.tesseract' in your terminal and restart the app."
                ) from cmd_err

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
            ocr_text_parts = []
            
            for idx, page in enumerate(doc):
                logger.info("PDF Parser: OCR-ing page %d/%d...", idx + 1, page_count)
                # Render page to 150 DPI image for optimal OCR balance of speed and text precision
                pix = page.get_pixmap(dpi=150)
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                page_txt = pytesseract.image_to_string(img)
                if page_txt:
                    ocr_text_parts.append(page_txt)
                    
            extracted_text = "\n".join(ocr_text_parts).strip()
            ocr_run = True
            logger.info("PDF Parser: OCR completed successfully. Extracted %d chars.", len(extracted_text))
            
        except Exception as ocr_err:
            logger.error("PDF Parser: OCR extraction failed: %s", ocr_err, exc_info=True)
            # Raise descriptive error to be caught by routes
            raise RuntimeError(f"OCR processing failed: {ocr_err}") from ocr_err

    # Final sanity check
    if not extracted_text.strip():
        raise ValueError("Document appears to be empty or has unextractable text.")

    return extracted_text, ocr_run, page_count
