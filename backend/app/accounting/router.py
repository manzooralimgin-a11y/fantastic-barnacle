from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounting.schemas import (
    BudgetCreate,
    BudgetRead,
    GLEntryCreate,
    GLEntryRead,
    InvoiceCreate,
    InvoiceRead,
)
from app.accounting.service import (
    create_budget,
    create_gl_entry,
    create_invoice,
    get_budgets,
    get_cash_flow,
    get_gl_entries,
    get_invoices,
    get_pl_report,
)
from app.database import get_db

router = APIRouter()


@router.get("/gl", response_model=list[GLEntryRead])
async def list_gl_entries(limit: int = Query(default=50, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    return await get_gl_entries(db, limit)


@router.get("/pl")
async def profit_and_loss(period: str | None = None, db: AsyncSession = Depends(get_db)):
    return await get_pl_report(db, period)


@router.get("/invoices", response_model=list[InvoiceRead])
async def list_invoices(
    status: str | None = None, limit: int = Query(default=50, ge=1, le=500), db: AsyncSession = Depends(get_db)
):
    return await get_invoices(db, status, limit)


@router.post("/invoices", response_model=InvoiceRead, status_code=201)
async def add_invoice(payload: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    return await create_invoice(db, payload)


@router.get("/cash-flow")
async def cash_flow(db: AsyncSession = Depends(get_db)):
    return await get_cash_flow(db)


@router.get("/budgets", response_model=list[BudgetRead])
async def list_budgets(period: str | None = None, db: AsyncSession = Depends(get_db)):
    return await get_budgets(db, period)


@router.post("/budgets", response_model=BudgetRead, status_code=201)
async def add_budget(payload: BudgetCreate, db: AsyncSession = Depends(get_db)):
    return await create_budget(db, payload)


@router.get("/reports/{report_type}")
async def get_report(report_type: str, db: AsyncSession = Depends(get_db)):
    if report_type == "pl":
        return await get_pl_report(db)
    if report_type == "cash-flow":
        return await get_cash_flow(db)
    return {"report_type": report_type, "message": "Report type not yet implemented"}
