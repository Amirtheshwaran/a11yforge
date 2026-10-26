import { useEffect, useRef, useState } from "react";
import "./styles.css";

/**
 * Deliberately inaccessible product/checkout page.
 *
 * DO NOT FIX the accessibility defects marked DEFECT below. They are
 * intentional test fixtures for the Phase 1 deterministic scanner
 * (see README.md) and the Phase 2 keyboard scenario
 * (`pnpm scenario:fixture`). Fixing them silently breaks `pnpm scan:fixture`
 * and `pnpm scenario:fixture` expectations and the engine tests.
 */
export default function App() {
  const [quantity, setQuantity] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus into the dialog when it opens (correct behavior).
  // Focus containment itself is deliberately NOT implemented (DEFECT E).
  useEffect(() => {
    if (modalOpen) {
      closeButtonRef.current?.focus();
    }
  }, [modalOpen]);

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
          <button
            type="button"
            className="proceed-to-checkout"
            onClick={() => setModalOpen(true)}
          >
            Proceed to checkout
          </button>
          {/*
           * DEFECT E (focus containment, Phase 2): the checkout dialog has
           * NO focus trap, and the page behind it is deliberately NOT made
           * inert. Repeated Tab presses walk out of the dialog onto
           * background controls while the modal stays open. Do NOT add a
           * focus trap, `inert`, or `tabindex="-1"` to background content.
           * Markup stays semantic (`role="dialog"`, labelled by its title)
           * so the failure is interaction-only, not invalid markup.
           */}
          {modalOpen && (
            <div className="modal-overlay">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="checkout-modal-title"
                data-testid="checkout-modal"
                id="checkout-modal"
                className="checkout-modal"
              >
                <h2 id="checkout-modal-title">Checkout</h2>
                <button
                  type="button"
                  ref={closeButtonRef}
                  id="checkout-modal-close"
                  className="checkout-modal-close"
                  onClick={() => setModalOpen(false)}
                >
                  Close
                </button>
                <div className="field">
                  <label htmlFor="checkout-modal-email">
                    Email for receipt
                  </label>
                  <input
                    id="checkout-modal-email"
                    name="checkout-modal-email"
                    type="email"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="button"
                  id="checkout-modal-continue"
                  className="checkout-modal-continue"
                  onClick={() => setModalOpen(false)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      <footer className="site-footer">
        {/*
         * Background controls: focusable elements behind the modal that a
         * correct focus trap would keep unreachable while the dialog is
         * open. They are the deterministic escape targets for DEFECT E.
         */}
        <a id="background-control" href="#shipping-info">
          Shipping info
        </a>{" "}
        <a id="background-help" href="#help">
          Help
        </a>
      </footer>
    </div>
  );
}
