import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const stocks = pathname === "/" || pathname.startsWith("/stocks/");
  const upload = pathname === "/upload";
  const admin = pathname === "/admin";

  async function onLogout() {
    try {
      await logout();
    } finally {
      void navigate("/login");
    }
  }

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
          {user?.role === "admin" ? (
            <Link to="/admin" aria-current={admin ? "page" : undefined}>
              People
            </Link>
          ) : null}
          <button type="button" className="nav-button" onClick={() => void onLogout()}>
            Log out
          </button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
