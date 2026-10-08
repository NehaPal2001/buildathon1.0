export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title} · Demo Shop</title></head>
<body>
<header data-testid="header">
  <a href="/" data-testid="nav-home">Demo Shop</a>
  <nav aria-label="Main">
    <a href="/search" data-testid="nav-search">Search</a>
    <a href="/cart" data-testid="nav-cart">Cart</a>
    <a href="/checkout" data-testid="nav-checkout">Checkout</a>
    <a href="/orders" data-testid="nav-orders">Orders</a>
    <a href="/account" data-testid="nav-account">Account</a>
  </nav>
</header>
<main>
${body}
</main>
</body></html>`;
}
