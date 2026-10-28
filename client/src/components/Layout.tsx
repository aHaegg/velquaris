import { Link, Outlet, useLocation } from "react-router-dom";

export function Layout() {
  const { pathname } = useLocation();
  const stocks = pathname === "/" || pathname.startsWith("/stocks/");
  const upload = pathname === "/upload";

  return (
    <>
      <header className="site">
        <Link className="mark" to="/">
          <span className="pip" aria-hidden="true" />
          Velquaris
        </Link>
        <nav>
          <Link to="/" aria-current={stocks ? "page" : undefined}>
            Stocks
          </Link>
          <Link to="/upload" aria-current={upload ? "page" : undefined}>
            Upload
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
