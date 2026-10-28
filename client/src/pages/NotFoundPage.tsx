import { Link } from "react-router-dom";
import { useTitle } from "../title";

export function NotFoundPage() {
  useTitle("Not found");
  return (
    <>
      <header className="page-head">
        <h1>Not found</h1>
        <p>That page is not in Velquaris.</p>
      </header>
      <p>
        <Link to="/">Back to stocks</Link>
      </p>
    </>
  );
}
