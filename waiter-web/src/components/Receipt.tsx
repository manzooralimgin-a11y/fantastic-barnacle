import type { BillRead, ReceiptData, TableOrderRead } from "../lib/api";

interface Props {
  order: TableOrderRead;
  bill: BillRead | null;
  receipt: ReceiptData | null;
  waiterName: string | null;
}

export function Receipt({ order, bill, receipt, waiterName }: Props) {
  const subtotal = bill?.subtotal ?? order.subtotal;
  const tax = bill?.tax_amount ?? order.tax_amount;
  const total = bill?.total ?? order.total;
  const items = receipt?.items ?? order.items ?? [];

  return (
    <div className="receipt">
      <div className="brand">DAS ELB · RESTAURANT</div>
      <div className="small">Goethestraße 1 · Hamburg</div>
      <div className="rule" />
      <div className="line">
        <span>Bill</span>
        <span>{bill?.bill_number ?? `#${order.id}`}</span>
      </div>
      <div className="line">
        <span>Order</span>
        <span>#{order.id}</span>
      </div>
      <div className="line">
        <span>Date</span>
        <span>{new Date().toLocaleString()}</span>
      </div>
      {waiterName ? (
        <div className="line">
          <span>Waiter</span>
          <span>{waiterName}</span>
        </div>
      ) : null}
      <div className="rule" />

      {items.map((it) => (
        <div className="line" key={it.id}>
          <span>
            {it.quantity}× {it.menu_item_name ?? `Item ${it.menu_item_id}`}
          </span>
          <span>€{it.total_price.toFixed(2)}</span>
        </div>
      ))}

      <div className="rule" />
      <div className="line">
        <span>Subtotal</span>
        <span>€{subtotal.toFixed(2)}</span>
      </div>
      <div className="line">
        <span>Tax</span>
        <span>€{tax.toFixed(2)}</span>
      </div>
      {bill && bill.service_charge > 0 ? (
        <div className="line">
          <span>Service</span>
          <span>€{bill.service_charge.toFixed(2)}</span>
        </div>
      ) : null}
      {bill && bill.discount_amount > 0 ? (
        <div className="line">
          <span>Discount</span>
          <span>−€{bill.discount_amount.toFixed(2)}</span>
        </div>
      ) : null}
      <div className="rule" />
      <div className="line grand">
        <span>TOTAL</span>
        <span>€{total.toFixed(2)}</span>
      </div>
      {bill?.paid_at ? (
        <div className="small">
          Paid {new Date(bill.paid_at).toLocaleString()}
        </div>
      ) : null}
      <div className="small">Thank you · Vielen Dank</div>
    </div>
  );
}
