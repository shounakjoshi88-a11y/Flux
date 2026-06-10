// src/hooks/useSessionRevocationListener.ts
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/client";

export function useSessionRevocationListener() {
  const supabase = createClient();
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || (event === "USER_UPDATED" && !session)) {
        navigate("/auth");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, supabase.auth]);
}