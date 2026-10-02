---
name: projeto-elo
description: Visão geral e decisões do projeto ELO (analistafjp-design/projeto-elo, público): CRM PWA de negociações em campo com clientes, comprovantes com OCR, interações com geolocalização e dashboard. Vite + React + Supabase. Use ao trabalhar nesse repositório.
---

# Projeto: ELO

- **Repositório:** analistafjp-design/projeto-elo (público). Lema:
  "Conectando equipes de campo e clientes".
- **O que é:** CRM de **negociações em campo**, PWA mobile first instalável:
  clientes e carteira, negociações (valor, vencimento, status), comprovantes
  com OCR, histórico de interações com geolocalização, alertas de vencimento
  e notificações, dashboard executivo, importação/exportação de clientes por
  Excel e exportação do dashboard em PDF.
- **Perfis:** Administrador (acesso total) e Operador (só os clientes
  vinculados a ele).
- **Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui (Radix), React
  Router, React Hook Form + Zod. Backend: Supabase (Auth, Postgres com RLS,
  Storage, Edge Functions em `supabase/functions`); migrações em
  `supabase/migrations`, script único `supabase/setup_completo.sql`.
- **Documentos:** `README.md` (funcionalidades, banco, configuração e
  "CONFIGURAÇÃO MANUAL") e `supabase/README.md`.
- **Decisões já tomadas**
  - O formulário de cliente **não tem CPF nem e-mail** (removidos a pedido);
    não os traga de volta.
  - Responsividade e overflow (fotos grandes, card de OCR) já corrigidos;
    teste celular, tablet e desktop ao mexer em tela.
  - O PWA se atualiza sozinho (auto-update).
  - A importação de Excel precisa aguentar planilhas reais grandes e com
    várias abas (`@e965/xlsx`).
- **Publicação:** GitHub Pages a cada push na `main`
  (`.github/workflows/deploy-pages.yml`, subcaminho `/projeto-elo/` via
  `GH_PAGES`); Vercel também suportada.
- **Checagens:** `npm run typecheck`, `npm run lint`, `npm run build`.
- **Segredos:** chaves do Supabase só em `.env` e nos secrets
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`,
  `VITE_WHATSAPP_NUMERO_PADRAO` no `.env.example`). Branch da `main`, PR em
  rascunho, mesclar só com "Pode mesclar".
