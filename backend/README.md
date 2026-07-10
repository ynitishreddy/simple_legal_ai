# Legal Timeline Backend — Phase 1

> **Automatic Legal Timeline Construction and Visualization using Temporal Event Graphs**

## Quick Start

```bash
cd backend

# 1. Create virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

pip install -r requirements.txt

# 2. (Optional) Copy env template
cp .env.example .env            # Edit with your AWS keys if using real S3

# 3. Initialise the local SQLite database
python init_db.py

# 4. Run the ingestion pipeline (falls back to local mock data without AWS credentials)
python -m ingestion.s3_streamer

# 5. Run the test suite
pytest tests/ -v
```

## Directory Layout

```
backend/
├── config.py                        # Centralised Pydantic settings
├── init_db.py                       # DB provisioning script
├── pyproject.toml                   # uv-compatible project manifest
├── requirements.txt                 # pip-compatible dependency list
├── .env.example                     # Environment variable template
│
├── db/
│   ├── __init__.py
│   ├── base.py                      # Engine, session factory, DeclarativeBase
│   └── models.py                    # Case, Event, TemporalRelation ORM models
│
├── ingestion/
│   ├── __init__.py
│   ├── s3_streamer.py               # S3 → DB ingestion (with local fallback)
│   └── mock_data/
│       └── judgments.json           # 5 realistic Indian HC judgment texts
│
└── tests/
    ├── __init__.py
    ├── conftest.py                  # Shared pytest fixtures
    ├── test_schema.py               # Schema integrity & CRUD tests
    └── test_ingestion.py            # Ingestion pipeline tests
```

## Data Model

```
Case ──< Event              (one Case → many Events)
Case ──< TemporalRelation   (one Case → many TemporalRelations)
Event ──< TemporalRelation  (source_event → many TemporalRelations)
Event ──< TemporalRelation  (target_event → many TemporalRelations)
```

| Model              | Key Fields                                                   |
|--------------------|--------------------------------------------------------------|
| `Case`             | id, case_citation, court_name, raw_text, parsed_text, status |
| `Event`            | id, case_id, event_trigger, normalized_date, raw_context_snippet |
| `TemporalRelation` | id, case_id, source_event_id, target_event_id, relation_type |

### Enums

- **CaseStatus**: `PENDING` → `PROCESSING` → `COMPLETED`
- **RelationType**: `BEFORE`, `AFTER`, `OVERLAPS`, `SIMULTANEOUS`

## Configuration

| Variable               | Default                          | Description                     |
|------------------------|----------------------------------|---------------------------------|
| `DATABASE_URL`         | `sqlite:///./legal_timeline.db`  | SQLAlchemy DSN                  |
| `AWS_ACCESS_KEY_ID`    | —                                | AWS credentials (optional)      |
| `AWS_SECRET_ACCESS_KEY`| —                                | AWS credentials (optional)      |
| `AWS_REGION`           | `ap-south-1`                     | S3 region                       |
| `S3_BUCKET`            | `indian-high-court-judgments`    | S3 bucket name                  |
| `S3_PREFIX`            | `raw/`                           | Key prefix for judgment objects |

## Phase Roadmap

| Phase | Description                                  | Status  |
|-------|----------------------------------------------|---------|
| 1     | Data Scaffolding & Ingestion Mocking         | ✅ Done |
| 2     | NLP Pipeline — Temporal Entity Extraction    | ⬜ Next |
| 3     | Temporal Event Graph Construction            | ⬜      |
| 4     | REST API (FastAPI)                            | ⬜      |
| 5     | Frontend Visualization                        | ⬜      |
