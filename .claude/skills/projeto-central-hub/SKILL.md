---
name: projeto-central-hub
description: Visão geral e regras de negócio do projeto Central Hub (analistafjp-design/central-hub, público): gestão de clientes e assinaturas de vários servidores (WPLAY, UNITV, TVS, P2BRAZ), financeiro, créditos e alertas de vencimento por WhatsApp. Vite + React + Supabase. Use ao trabalhar nesse repositório.
---

# Projeto: Central Hub

- **Repositório:** analistafjp-design/central-hub (público). Lema: "Sua
  operação em um único lugar".
- **O que é:** painel de gestão de clientes e assinaturas de **vários
  servidores** (WPLAY, UNITV, TVS, P2BRAZ ou "Outro"): dashboard executivo e
  por servidor, cadastro de clientes, importação de planilhas
  (`.xlsx`/`.csv`), financeiro (receitas/renovações e gastos), controle de
  créditos e alertas de vencimento com aviso por WhatsApp.
- **Stack:** Vite + React + TypeScript + Tailwind + shadcn/ui, React Router,
  React Hook Form + Zod, Recharts, ExcelJS (sob demanda). Backend: Supabase
  direto do cliente (PostgREST + Auth) com RLS; migrações em
  `supabase/migrations`, script único `supabase/setup_completo.sql`.
- **Documentos:** `README.md` (funcionalidades e o que está pronto) e
  `supabase/README.md` (tabelas, RLS, views, função de status e alertas).
- **Regras já combinadas**
  - **Renovar desconta créditos** do servidor, com alerta de saldo baixo.
  - **Valor sugerido do pagamento** = mensalidade do cliente × meses
    ativados; sem mensalidade, referência de R$ 30/mês. Registrar o
    pagamento pode já renovar o cliente, estendendo a expiração.
  - A mensagem de lembrete no WhatsApp é assinada com o nome da empresa.
  - Valores em R$ e números nos cards **não podem ser cortados nem quebrar**
    (já corrigido duas vezes).
  - **Importação:** upload → mapeamento de colunas (detecção automática) →
    pré-visualização com validação e duplicidade (por usuário/nome no
    servidor); linhas com erro ou duplicadas são ignoradas e reportadas.
  - **Falta:** módulos além de Dashboard, Servidores, Clientes, Importação,
    Financeiro e Alertas (schema já no banco).
- **Publicação:** GitHub Pages a cada push na `main`
  (`.github/workflows/deploy-pages.yml`); Vercel também suportada.
- **Checagens:** `npm run typecheck`, `npm run lint`, `npm run build`.
- **Segredos:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` só no `.env`
  local e nos secrets. Branch da `main`, PR em rascunho, mesclar só com
  "Pode mesclar".
