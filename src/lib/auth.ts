import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Fonte única da allowlist — antes só era checada em index.html,
 * deixando as outras telas acessíveis a qualquer conta Google autenticada.
 */
const ALLOWED_EMAILS = ["marciordcosta@gmail.com", "teste@teste.com"];

/**
 * Garante sessão válida e autorizada antes de renderizar uma página.
 * Redireciona para login.html e lança em caso de falha, para que o
 * chamador interrompa a inicialização (o redirect não é síncrono).
 */
export async function requireAuth(): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    window.location.href = "login.html";
    throw new Error("Usuário não autenticado");
  }

  if (!user.email || !ALLOWED_EMAILS.includes(user.email)) {
    alert("Acesso não autorizado.");
    await supabase.auth.signOut();
    window.location.href = "login.html";
    throw new Error("Usuário não autorizado");
  }

  return user;
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
