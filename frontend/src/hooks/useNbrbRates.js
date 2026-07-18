import { useEffect, useState } from "react";
import { fetchNbrbRates } from "../utils/currency.js";

export function useNbrbRates() {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNbrbRates()
      .then((data) => {
        if (!cancelled) setRates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rates, loading, error };
}
