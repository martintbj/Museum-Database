import { useEffect, useState } from "react";
import "../pages/sheets/Style.cart.css";
import { useUser } from "@clerk/clerk-react";
import { useLocation } from "wouter";
import { capitalize } from "../components/utils.custom";

export function Cart() {
  const { user } = useUser();
  const [, navigate] = useLocation();

  const [tickets, setTickets] = useState({});
  const [exhibits, setExhibits] = useState({});
  const [giftshop, setGiftshop] = useState({});
  const [membership, setMembership] = useState(null);
  const [membershipData, setMembershipData] = useState(null);
  const [formValid, setFormValid] = useState(false);

  const [totals, setTotals] = useState({
    subtotal: "0.00",
    tax: "0.00",
    serviceFee: "0.00",
    processingFee: "0.00",
    total: "0.00",
  });

  useEffect(() => {
    const saved = localStorage.getItem("museum_cart");
    if (saved) {
      const parsed = JSON.parse(saved);
      setTickets(parsed.tickets || {});
      setExhibits(parsed.exhibits || {});
      setGiftshop(parsed.giftshop || {});
      setMembership(parsed.membership || null);
    }
  }, []);

  useEffect(() => {
    async function loadMembershipDetails() {
      if (membership && user?.id) {
        try {
          const res = await fetch("/api/custom/memberships", { method: "GET" });
          const text = await res.text();
          const json = text ? JSON.parse(text) : {};
          const match = json.data.find((m) => m.membership_type === membership);
          setMembershipData(match);
        } catch (error) {
          console.error("Failed to fetch membership data:", error);
        }
      }
    }
    loadMembershipDetails();
  }, [membership, user?.id]);

  useEffect(() => {
    const form = document.querySelector(".checkout-form");
    const handler = () => {
      const isValid = form?.checkValidity() || false;
      setFormValid(isValid);
    };
    form?.addEventListener("input", handler);
    handler();
    return () => form?.removeEventListener("input", handler);
  }, []);

  useEffect(() => {
    const subtotal =
      Object.values(tickets).reduce(
        (acc, cur) => acc + cur.count * cur.price,
        0,
      ) +
      Object.values(exhibits).reduce(
        (acc, cur) => acc + cur.count * cur.price,
        0,
      ) +
      Object.values(giftshop).reduce(
        (acc, cur) => acc + cur.count * cur.price,
        0,
      ) +
      (membershipData?.price || 0);

    const tax = subtotal * 0.0825;
    const serviceFee = subtotal > 0 ? 2.0 : 0;
    const processingFee = subtotal > 0 ? 0.75 : 0;
    const total = subtotal + tax + serviceFee + processingFee;

    setTotals({
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      serviceFee: serviceFee.toFixed(2),
      processingFee: processingFee.toFixed(2),
      total: total.toFixed(2),
    });
  }, [tickets, exhibits, giftshop, membershipData]);

  const handleGiftshopCheckout = async (guestId, giftshopCart) => {
    const simplifiedCart = {};
    for (const [itemId, item] of Object.entries(giftshopCart)) {
      simplifiedCart[itemId] = parseInt(item.count || 0);
    }

    const res = await fetch("/api/custom/giftshop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart: simplifiedCart, guestId }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok || !data.success) {
      const message = Array.isArray(data.errors)
        ? data.errors[0]
        : data.message || "Unknown error.";
      throw new Error(message);
    }
    return data.saleIds;
  };

  const handleTicketMembershipCheckout = async (guestId) => {
    const res = await fetch("/api/custom/tickets/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestId,
        tickets,
        exhibits,
        membership,
      }),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok || !data.success) {
      const message = Array.isArray(data.errors)
        ? data.errors[0]
        : data.message || "Unknown error.";
      throw new Error(message);
    }

    return data.saleIds;
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    const form = e.target;

    const name = form.name.value;
    const email = form.email.value;
    const phone = form.phone.value;

    try {
      let accountId;

      // Try to find the account
      const lookupRes = await fetch("/api/account-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone }),
      });

      const lookupData = await lookupRes.json();
      if (lookupData.success) {
        accountId = lookupData.accountId;
      } else {
        const regRes = await fetch("/api/register-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone }),
        });

        const regData = await regRes.json();
        if (!regData.success) throw new Error("Account creation failed");
        accountId = regData.accountId;
      }

      const payload = {
        accountId,
        tickets: Object.fromEntries(
          Object.entries(tickets).map(([t, val]) => [t, val.count]),
        ),
        exhibits: Object.fromEntries(
          Object.entries(exhibits).map(([e, val]) => [e, val.count]),
        ),
        giftshop: Object.fromEntries(
          Object.entries(giftshop).map(([id, val]) => [id, val.count]),
        ),
        membership,
      };

      console.log("Sending checkout:", payload);

      const orderRes = await fetch("/api/custom/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await orderRes.text();
      let orderData = {};

      try {
        orderData = text ? JSON.parse(text) : {};
      } catch (err) {
        console.error("❌ JSON parse error:", err);
        console.log("🪵 Raw response body:", text);
        throw new Error("Server response was not valid JSON");
      }

      if (!orderData.success || !Array.isArray(orderData.saleIds)) {
        throw new Error(orderData.errors?.[0] || "Checkout failed");
      }

      localStorage.removeItem("museum_cart");
      navigate(`/dashboard/receipt?ids=${orderData.saleIds.join(",")}`);
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Checkout failed: " + err.message);
    }
  };

  return (
    <div className="page-layout">
      <div className="order-summary-box">
        <h3>Order Summary</h3>
        {Object.entries(tickets).map(([type, item]) => (
          <div key={type} className="order-line">
            <span>{capitalize(type)}</span>
            <span>
              {item.count} × ${item.price.toFixed(2)}
            </span>
          </div>
        ))}
        {Object.entries(exhibits).map(([name, item]) => (
          <div key={name} className="order-line">
            <span>{name}</span>
            <span>
              {item.count} × ${item.price.toFixed(2)}
            </span>
          </div>
        ))}
        {Object.entries(giftshop).map(([id, item]) => (
          <div key={id} className="order-line">
            <span>Gift Shop Item #{id}</span>
            <span>
              {item.count} × ${item.price.toFixed(2)}
            </span>
          </div>
        ))}
        {membershipData && (
          <div className="order-line">
            <span>{capitalize(membershipData.membership_type)} Membership</span>
            <span>
              ${membershipData.price.toFixed(2)} / {membershipData.period}
            </span>
          </div>
        )}
        {parseFloat(totals.subtotal) > 0 && (
          <>
            <div className="order-line">
              <strong>Subtotal</strong>
              <strong>${totals.subtotal}</strong>
            </div>
            <div className="order-line">
              <span>Sales Tax (8.25%)</span>
              <span>${totals.tax}</span>
            </div>
            <div className="order-line">
              <span>Service Fee</span>
              <span>${totals.serviceFee}</span>
            </div>
            <div className="order-line">
              <span>Processing Fee</span>
              <span>${totals.processingFee}</span>
            </div>
            <div className="order-line">
              <strong>Total</strong>
              <strong>${totals.total}</strong>
            </div>
          </>
        )}
      </div>

      <form className="checkout-form" onSubmit={(e) => handleCheckout(e)}>
        <h3>Checkout</h3>

        <fieldset>
          <legend>Personal Information</legend>
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue="Jane Doe"
            required
          />

          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue="jane@example.com"
            required
          />

          <label htmlFor="phone">Phone Number (no dashes)</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            pattern="^\d{10,12}$"
            title="Phone number must contain only digits (10–12 numbers)"
            required
          />
        </fieldset>

        <fieldset>
          <legend>Billing & Shipping Address</legend>
          <label htmlFor="address1">Address Line 1</label>
          <input
            id="address1"
            name="address1"
            type="text"
            defaultValue="123 Museum Lane"
            required
          />

          <label htmlFor="address2">Address Line 2</label>
          <input id="address2" name="address2" type="text" />

          <label htmlFor="city">City</label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue="New York"
            required
          />

          <label htmlFor="state">State/Province</label>
          <input
            id="state"
            name="state"
            type="text"
            defaultValue="NY"
            required
          />

          <label htmlFor="zip">Postal Code</label>
          <input
            id="zip"
            name="zip"
            type="text"
            defaultValue="10001"
            required
          />

          <label htmlFor="country">Country</label>
          <input
            id="country"
            name="country"
            type="text"
            defaultValue="USA"
            required
          />
        </fieldset>

        <fieldset>
          <legend>Payment Information</legend>
          <label htmlFor="cardName">Cardholder Name</label>
          <input
            id="cardName"
            name="cardName"
            type="text"
            defaultValue="Jane Doe"
            required
          />

          <label htmlFor="cardNumber">Card Number</label>
          <input
            id="cardNumber"
            name="cardNumber"
            type="text"
            inputMode="numeric"
            defaultValue="4242424242424242"
            pattern="\d{13,19}"
            required
          />

          <div className="card-row">
            <div>
              <label htmlFor="exp">Expiration (MM/YY)</label>
              <input
                id="exp"
                name="exp"
                type="text"
                inputMode="numeric"
                defaultValue="12/30"
                pattern="\d{2}/\d{2}"
                required
              />
            </div>
            <div>
              <label htmlFor="cvv">CVV</label>
              <input
                id="cvv"
                name="cvv"
                type="text"
                inputMode="numeric"
                defaultValue="123"
                pattern="\d{3,4}"
                required
              />
            </div>
          </div>
        </fieldset>

        <section className="terms-check">
          <label>
            <input type="checkbox" defaultChecked required /> I agree to the
            terms and conditions.
          </label>
        </section>

        <button className="checkout-button" type="submit" disabled={!formValid}>
          Place Order
        </button>
      </form>
    </div>
  );
}
