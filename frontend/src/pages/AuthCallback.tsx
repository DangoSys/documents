import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      localStorage.setItem("token", token);
    }
    navigate("/docs/en", { replace: true });
  }, [params, navigate]);

  return <div>Authenticating...</div>;
}
