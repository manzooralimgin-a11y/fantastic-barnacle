import type { CartLine } from "../App";

interface Props {
  cart: CartLine[];
  onInc: (itemId: string) => void;
  onDec: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

const EUR = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "EUR" });

export function CartPanel({ cart, onInc, onDec, onRemove }: Props) {
  const subtotal = cart.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0
  );
  const tax = subtotal * 0.07;
  const total = subtotal + tax;

  if (cart.length === 0) {
    return <div className="status muted">Tap a menu item to add it here.</div>;
  }

  return (
    <>
      <div className="cart-list">
        {cart.map((line) => (
          <div key={line.item.id} className="cart-row">
            <div>
              <div style={{ fontWeight: 600 }}>
                {line.item.emoji} {line.item.name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#e8d9b099" }}>
                {EUR(line.item.price)} each
              </div>
              <div className="qty" style={{ marginTop: 4 }}>
                <button onClick={() => onDec(line.item.id)} type="button">
                  −
                </button>
                <span>{line.quantity}</span>
                <button onClick={() => onInc(line.item.id)} type="button">
                  +
                </button>
                <button
                  onClick={() => onRemove(line.item.id)}
                  type="button"
                  style={{ marginLeft: 6, fontSize: "0.75rem" }}
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="line-total">
              {EUR(line.item.price * line.quantity)}
            </div>
          </div>
        ))}
      </div>

      <div className="totals">
        <div
          style={{ display: "flex", justifyContent: "space-between" }}
        >
          <span>Subtotal</span>
          <span>{EUR(subtotal)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#e8d9b0aa",
            fontSize: "0.85rem",
          }}
        >
          <span>Tax (7% est.)</span>
          <span>{EUR(tax)}</span>
        </div>
        <div
          className="grand"
          style={{ display: "flex", justifyContent: "space-between" }}
        >
          <span>Total</span>
          <span>{EUR(total)}</span>
        </div>
      </div>
    </>
  );
}
