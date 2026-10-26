import { useState } from "react";
import "./styles.css";

/**
 * Deliberately inaccessible product/checkout page.
 *
 * DO NOT FIX the accessibility defects marked DEFECT below. They are
 * intentional test fixtures for the Phase 1 deterministic scanner
 * (see README.md). Fixing them silently breaks `pnpm scan:fixture`
 * expectations and the engine smoke test.
 */
export default function App() {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="page">
      <header className="site-header">
        <span className="store-name">Broken Shop</span>
      </header>
      <main className="content">
        <h1>Everyday Ceramic Mug</h1>

        {/* DEFECT B (image-alt): product image with no alt attribute at all. */}
        <img className="product-image" src="/product.svg" />

        <p className="price">$18.00</p>

        <section aria-labelledby="quantity-heading">
          <h2 id="quantity-heading">Quantity</h2>
          <div className="quantity-row">
            {/*
             * DEFECT A (button-name): decrement control shows only a minus
             * icon with no accessible name (no text, aria-label, or title).
             * The increment button is intentionally correct for contrast.
             */}
            <button
              type="button"
              className="quantity-decrement"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="7" width="12" height="2" fill="currentColor" />
              </svg>
            </button>
            <span className="quantity-value">{quantity}</span>
            <button
              type="button"
              className="quantity-increment"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="7" width="12" height="2" fill="currentColor" />
                <rect x="7" y="2" width="2" height="12" fill="currentColor" />
              </svg>
            </button>
          </div>
        </section>

        <section aria-labelledby="checkout-heading">
          <h2 id="checkout-heading">Checkout</h2>
          <div className="field">
            <label htmlFor="full-name">Full name</label>
            <input
              id="full-name"
              name="full-name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
            />
          </div>
          <div className="field">
            {/*
             * DEFECT C (label): visual "Email" text is a plain div, not a
             * <label>, so the input has no programmatically associated label.
             * The Full name field above is intentionally correct for contrast.
             */}
            <div className="field-label-text">Email</div>
            {/*
             * No placeholder here either: axe-core accepts a non-empty
             * placeholder as a label, so one would mask defect C.
             */}
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
            />
          </div>
          {/*
           * DEFECT D (color-contrast): #999 on white is ~2.85:1, well below
           * the 4.5:1 required for small text.
           */}
          <p className="fine-print">
            Shipping is calculated at checkout and may take up to 10 days.
          </p>
          <button type="button" className="place-order">
            Place order
          </button>
        </section>
      </main>
    </div>
  );
}
