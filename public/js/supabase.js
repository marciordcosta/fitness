// js/supabase.js - Versão Final e Global

const supabaseUrl = "https://kkrbmuwwaxejfdqiczee.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcmJtdXd3YXhlamZkcWljemVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0ODc4MjYsImV4cCI6MjA3ODA2MzgyNn0.YtBWvo2DA9x49dN5C14jHRxWD4Hes7tOMnxMAdED86A";

// CORREÇÃO CRÍTICA:
// 1. Cria a variável 'sb'.
// 2. Atribui ao objeto 'window' para que ela seja global e acessível em todas as páginas.
// 3. Adiciona as opções de persistência.
window.sb = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true, // ISSO RESOLVE O PROBLEMA DE 'USUÁRIO NÃO AUTENTICADO'
    detectSessionInUrl: true,
  },
});