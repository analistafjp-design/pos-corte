#!/usr/bin/env python3
"""
Gera planilhas SINTÉTICAS para testar o painel de Pós Corte.

Nada aqui vem da base real: nomes, matrículas, valores e frentes são inventados.
Os números-alvo (8.136 / 7.461 / 675 / 230 / 389 / 2) foram escolhidos para
reproduzir a ordem de grandeza da base de referência descrita no projeto e
exercitar o leitor com 296 colunas; eles NÃO substituem a conferência com a
planilha real.

Uso: python3 tools/make_fixtures.py <pasta_saida> [--small-only]
Requer: xlsxwriter, openpyxl (pip install xlsxwriter openpyxl).
"""
import json
import random
import re
import sys
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

import xlsxwriter
from openpyxl import Workbook

REQUIRED = [
    "Recurso", "Cód. Protocolo Origem", "ID da Atividade", "Matrícula", "Código/Descrição", "Data",
    "Status da Atividade", "Nome do Solicitante", "Cidade", "Início do SLA", "Fim do SLA",
    "Tipo do Corte Realizado", "Qual a situação do imóvel?", "Irregularidade Encontrada?",
    "Valor Total dos Débitos", "Negociou O Débito?", "Categoria", "Situação Do Imóvel",
    "Serviço adicionais resposta",
]
TOTAL_COLS = 296
# Posições (0-based) das colunas usadas: espalhadas, fora de ordem e não contíguas.
POSITIONS = [4, 0, 1, 7, 12, 3, 20, 25, 31, 40, 41, 90, 91, 130, 131, 200, 201, 202, 295]

FRENTES = {  # Nomenclatura -> Frente (nomes fictícios)
    "AL": "Frente Alfa", "AL-X": "Frente Alfa Extra", "BE": "Frente Beta", "GA": "Frente Gama",
    "DE": "Frente Delta", "EP": "Frente Epsilon", "ZE": "Frente Zeta", "ET": "Frente Eta",
    "TE": "Frente Teta", "IO": "Frente Iota",
}
for i in range(1, 43):
    FRENTES[f"SUB{i:02d}"] = f"Frente Sub {((i - 1) % 6) + 1}"
FRENTES_SHEET = list(FRENTES.items())  # 52 linhas

CIDADES = ["Cidade Norte", "Cidade Sul", "Cidade Leste", "Cidade Oeste", "Vila Azul", "Vila Verde",
           "Porto Novo", "Alto Vale", "Bela Serra", "Campo Belo", "Rio Claro", "Monte Alto"]
NOMES = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado", "Fabio Neri",
         "Gina Braga", "Hugo Melo", "Iris Alves", "João Cruz"]
CODIGOS_SERVICO = ["110010-VISTORIA PÓS CORTE", "110011-VISTORIA PÓS CORTE - INTERMEDIÁRIO", "110012-VISTORIA PÓS CORTE - AVANÇADO",
                   "210010-VISTORIA PÓS CORTE", "210011-VISTORIA PÓS CORTE - INTERMEDIÁRIO", "210012-VISTORIA PÓS CORTE - AVANÇADO",
                   "310010-VISTORIA PÓS CORTE", "310011-VISTORIA PÓS CORTE - INTERMEDIÁRIO", "310012-VISTORIA PÓS CORTE - AVANÇADO"]
STATUS_CONTADOS = ("Finalizada", "Encerrada com Ocorrência")
EM_ESCOPO = re.compile(r"^\s*(110010|110011|110012|210010|210011|210012|310010|310011|310012)(?!\d)")


def em_escopo(r):
    return bool(EM_ESCOPO.match(str(r.get("Código/Descrição") or "")))


OUTROS_CODIGOS = ["120045 - Religação", "120077 - Troca de hidrômetro", "130001 - Vistoria", "140010 - Reparo cavalete",
                  "150022 - Ramal", "160005 - Supressão"]
EXTRA_PREFIX = "Campo extra"


def nova_matriz(rng, n_rows, spec):
    """Cria as linhas (dicts) com marcações para o cálculo independente dos esperados."""
    rows = []
    ids = list(range(700000, 700000 + n_rows))
    rng.shuffle(ids)
    idx = list(range(n_rows))
    rng.shuffle(idx)
    it = iter(idx)
    take = lambda k: [next(it) for _ in range(k)]

    status = ["Finalizada"] * n_rows
    for i in take(spec["exoc"]):
        status[i] = "Encerrada com Ocorrência"
    for i in take(spec.get("outros", 0)):
        status[i] = "Cancelada"

    neg = set(take(spec["neg"]))
    termo_only = take(spec["termos"] - spec["neg_e_termo"])
    neg_termo = rng.sample(sorted(neg), spec["neg_e_termo"])
    termos = set(termo_only) | set(neg_termo)
    sem_desd = set(rng.sample(sorted(neg - termos), spec["sem_desdobro"]))
    decoys_num = set(take(spec["decoy_num"]))
    irreg_sem_codigo = set(take(spec["irreg_sem_codigo"]))
    neg_decoy = set(take(spec["neg_decoy"]))

    prefixes = [k for k in FRENTES] + ["ZZ"]
    for i in range(n_rows):
        d = date(2026, 1, 2) + timedelta(days=rng.randrange(0, 270))
        if d > date(2026, 9, 28):
            d = date(2026, 9, 28)
        r = {
            "Recurso": f"{rng.choice(prefixes)}-{rng.randrange(1, 30):02d}",
            "Cód. Protocolo Origem": f"OS{5000000 + rng.randrange(0, 900000)}",
            "ID da Atividade": ids[i],
            "Matrícula": f"{rng.randrange(100000, 999999)}",
            "Código/Descrição": rng.choice(CODIGOS_SERVICO),
            "Data": d,
            "Status da Atividade": status[i],
            "Nome do Solicitante": rng.choice(NOMES),
            "Cidade": rng.choice(CIDADES),
            "Início do SLA": datetime(d.year, d.month, d.day, 8, 0, 0),
            "Fim do SLA": datetime(d.year, d.month, d.day, 8, 0, 0) + timedelta(days=rng.randrange(1, 4)),
            "Tipo do Corte Realizado": rng.choice(["Cavalete", "Ramal", "Hidrômetro"]),
            "Qual a situação do imóvel?": rng.choice(["Ocupado", "Fechado", "Desocupado"]),
            "Irregularidade Encontrada?": rng.choice(["Sim", "Não", ""]),
            "Valor Total dos Débitos": None,
            "Negociou O Débito?": rng.choice(["Não", "Não", "", "Nao"]),
            "Categoria": rng.choice(["Residencial", "Comercial", "Industrial"]),
            "Situação Do Imóvel": rng.choice(["Ativo", "Cortado", "Inativo"]),
            "Serviço adicionais resposta": "",
        }
        r["_idx"] = i
        r["Recurso"] = r["Recurso"]
        sa = []
        if i in neg:
            r["Negociou O Débito?"] = rng.choice(["Sim", "Sim", "SIM", " sim ", "sim"])
            r["Valor Total dos Débitos"] = round(rng.uniform(80, 4500), 2)
            if i not in sem_desd:
                sa.append(rng.choice(OUTROS_CODIGOS))
        if i in neg_decoy:
            r["Negociou O Débito?"] = rng.choice(["Sim, parcial", "Simulado", "Não negociou"])
            r["Valor Total dos Débitos"] = round(rng.uniform(80, 4500), 2)
        if i in termos:
            codes = rng.choice([["110013"], ["310013"], ["110013", "310013"]])
            sa.append(" | ".join(f"{c} - Termo {'Serviços' if c.startswith('1') else 'VCG'}" for c in codes) if rng.random() < .5 else ";".join(codes))
            r["Irregularidade Encontrada?"] = "Sim"
        if i in decoys_num:
            sa.append(rng.choice(["1100130 - não é termo", "9310013", "2110013 x", "1100139", "31001", "0110013"]))
        if i in irreg_sem_codigo:
            r["Irregularidade Encontrada?"] = "Sim"
            if not sa:
                sa.append(rng.choice(OUTROS_CODIGOS))
        if i in neg and i not in sem_desd and not sa:
            sa.append(OUTROS_CODIGOS[0])
        r["Serviço adicionais resposta"] = " ; ".join(sa)
        if i in sem_desd and rng.random() < .5:
            r["Serviço adicionais resposta"] = "   "  # só espaços também é "Sem Desdobro"
        r["_neg"] = i in neg
        r["_termos"] = i in termos
        rows.append(r)
    rng.shuffle(rows)
    return rows


TERMO_RE = re.compile(r"(?<![0-9])(110013|310013)(?![0-9])")


def esperados(rows, frentes=FRENTES):
    """Cálculo independente (Python) dos indicadores, a partir das regras do projeto."""
    def frente_de(rec):
        rec = rec.strip().upper()
        best = None
        for k, v in frentes.items():
            if rec.startswith(k.upper()) and (best is None or len(k) > len(best[0])):
                best = (k, v)
        return best[1] if best else "Não mapeada"

    rows = [r for r in rows if em_escopo(r) and r["Status da Atividade"] in STATUS_CONTADOS]  # só serviços dos 9 códigos e status contados
    out = {"atividades": 0, "exec": 0, "exoc": 0, "neg": 0, "termos": 0, "semDesdobro": 0, "t11": 0, "t31": 0,
           "debito": 0.0, "negETermo": 0, "porMes": {}, "porFrente": {}, "porCidade": {}, "porEquipe": {}}
    for r in rows:
        st = r["Status da Atividade"].strip().lower()
        sa = r["Serviço adicionais resposta"] or ""
        neg = (r["Negociou O Débito?"] or "").strip().lower() == "sim"
        codes = set(TERMO_RE.findall(sa))
        termo = bool(codes)
        mes = r["Data"].strftime("%Y-%m")
        f = frente_de(r["Recurso"])
        out["atividades"] += 1
        out["exec"] += st == "finalizada"
        out["exoc"] += st == "encerrada com ocorrência"
        out["neg"] += neg
        out["termos"] += termo
        out["t11"] += "110013" in codes
        out["t31"] += "310013" in codes
        out["semDesdobro"] += neg and sa.strip() == ""
        out["negETermo"] += neg and termo
        v = r["Valor Total dos Débitos"]
        if isinstance(v, str):  # "R$ 1.000,50" -> 1000.50
            v = float(re.sub(r"[^\d,]", "", v).replace(",", ".") or 0)
        if neg and v is not None:
            out["debito"] += v
        m = out["porMes"].setdefault(mes, {"atividades": 0, "neg": 0, "termos": 0})
        m["atividades"] += 1
        m["neg"] += neg
        m["termos"] += termo
        out["porFrente"][f] = out["porFrente"].get(f, 0) + 1
        out["porCidade"][r["Cidade"]] = out["porCidade"].get(r["Cidade"], 0) + 1
        out["porEquipe"][r["Recurso"]] = out["porEquipe"].get(r["Recurso"], 0) + 1
    out["debito"] = round(out["debito"], 2)
    # equipes que trabalharam, equipe-dias e produtividade (visitas por equipe por dia), calculados à parte do painel
    vistos = [r for r in rows]
    out["equipes"] = len({r["Recurso"].strip().lower() for r in vistos if r["Recurso"].strip()})
    out["dias"] = len({r["Data"] for r in vistos})
    ed = {(r["Recurso"].strip().lower(), r["Data"]) for r in vistos if r["Recurso"].strip()}
    out["equipeDias"] = len(ed)
    out["produtividade"] = out["atividades"] / len(ed) if ed else None
    out["assertividade"] = out["termos"] / out["exec"] if out["exec"] else None
    out["efetividade"] = out["neg"] / out["exec"] if out["exec"] else None
    out["equipesPorDia"] = {}
    for rec, dia in ed:
        out["equipesPorDia"][dia.isoformat()] = out["equipesPorDia"].get(dia.isoformat(), 0) + 1
    cid = {}
    for r in vistos:
        c = cid.setdefault(r["Cidade"].strip().lower(), {"percorrido": 0, "exec": 0, "termos": 0, "neg": 0, "ed": set()})
        c["percorrido"] += 1
        c["exec"] += r["Status da Atividade"].strip().lower() == "finalizada"
        c["termos"] += bool(TERMO_RE.search(r["Serviço adicionais resposta"] or ""))
        c["neg"] += (r["Negociou O Débito?"] or "").strip().lower() == "sim"
        if r["Recurso"].strip():
            c["ed"].add((r["Recurso"].strip().lower(), r["Data"]))
    out["porCidadeProd"] = {k: {"percorrido": v["percorrido"], "equipeDias": len(v["ed"]), "produtividade": (v["percorrido"] / len(v["ed"])) if v["ed"] else None,
                                "assertividade": (v["termos"] / v["exec"]) if v["exec"] else None, "efetividade": (v["neg"] / v["exec"]) if v["exec"] else None}
                           for k, v in cid.items()}
    return out


def cabecalho(rng, extra_dup=True):
    """296 nomes de coluna; as 19 usadas em posições espalhadas."""
    names = [None] * TOTAL_COLS
    order = REQUIRED[:]
    rng2 = random.Random(7)
    rng2.shuffle(order)
    for name, pos in zip(order, POSITIONS):
        names[pos] = name
    n = 1
    for i in range(TOTAL_COLS):
        if names[i] is None:
            names[i] = f"{EXTRA_PREFIX} {n:03d}"
            n += 1
    if extra_dup:
        names[TOTAL_COLS - 3] = names[10] if names[10].startswith(EXTRA_PREFIX) else names[11]
    return names


def valor_celula(col, r, rng_local):
    return r.get(col)


def linha_completa(names, r, extra_rng):
    out = []
    for c, name in enumerate(names):
        if name in r and not name.startswith("_"):
            out.append(r[name])
        else:
            # colunas extras: preenchimento parcial e determinístico
            k = (r["_idx"] * 31 + c * 17) % 10
            out.append(f"x{c}-{k}" if k < 4 else ("" if k < 7 else None))
    return out


# ---------------------------------------------------------------------------
def escrever_xlsxwriter(path, names, rows, extras_sheets, frentes=FRENTES_SHEET, constant_memory=False, date_1904=False,
                        datas_como_texto=False, sheet_names=None):
    sheet_names = sheet_names or {}
    wb = xlsxwriter.Workbook(str(path), {"constant_memory": constant_memory, "date_1904": date_1904})
    fdate = wb.add_format({"num_format": "dd/mm/yyyy"})
    fdt = wb.add_format({"num_format": "dd/mm/yyyy hh:mm:ss"})
    fmoney = wb.add_format({"num_format": '"R$" #,##0.00'})
    rng = random.Random(3)

    def escrever(ws, rows_):
        for c, n in enumerate(names):
            ws.write_string(0, c, n)
        for ri, r in enumerate(rows_, start=1):
            vals = linha_completa(names, r, rng)
            for c, v in enumerate(vals):
                name = names[c]
                if v is None or v == "":
                    if name == "Valor Total dos Débitos" and r["_idx"] % 2:
                        ws.write_string(ri, c, "R$ ")  # a base real traz "R$ " quando não há valor
                    elif v == "" and not constant_memory:
                        ws.write_string(ri, c, "")
                    continue
                if name == "Data":
                    if datas_como_texto:
                        ws.write_string(ri, c, v.strftime("%d/%m/%Y"))
                    else:
                        ws.write_datetime(ri, c, datetime(v.year, v.month, v.day), fdate)
                elif name in ("Início do SLA", "Fim do SLA"):
                    if datas_como_texto:
                        ws.write_string(ri, c, v.strftime("%Y-%m-%d %H:%M:%S"))
                    else:
                        ws.write_datetime(ri, c, v, fdt)
                elif name == "Valor Total dos Débitos":
                    # três formas: número, "R$ 1.234,56" e "R$ 1234,56" (como na base real)
                    k = r["_idx"] % 3
                    if isinstance(v, str):
                        ws.write_string(ri, c, v)
                    elif k == 0:
                        ws.write_number(ri, c, v, fmoney)
                    elif k == 1:
                        s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        ws.write_string(ri, c, f"R$ {s}")
                    else:
                        ws.write_string(ri, c, f"R$ {v:.2f}".replace(".", ","))
                elif name == "ID da Atividade":
                    ws.write_number(ri, c, v)
                elif isinstance(v, (int, float)):
                    ws.write_number(ri, c, v)
                else:
                    ws.write_string(ri, c, str(v))

    ws = wb.add_worksheet(sheet_names.get("base", "Base"))
    escrever(ws, rows)
    for key, sub in extras_sheets.items():
        ws2 = wb.add_worksheet(sheet_names.get(key, {"termos": "Pós Corte com Termo", "negociacoes": "Pós Corte com Negociação"}[key]))
        escrever(ws2, sub)
    if frentes is not None:
        wf = wb.add_worksheet(sheet_names.get("frentes", "Frente de Serviço"))
        wf.write_row(0, 0, ["Frente", "Nomenclatura"])
        for i, (nom, fr) in enumerate(frentes, start=1):
            wf.write_row(i, 0, [fr, nom])
    wb.close()


def escrever_openpyxl(path, names, rows, extras_sheets, frentes=FRENTES_SHEET):
    wb = Workbook()
    ws = wb.active
    ws.title = "Base"

    def escrever(ws_, rows_):
        ws_.append(names)
        for r in rows_:
            vals = linha_completa(names, r, None)
            for c, n in enumerate(names):
                if n == "Data" and vals[c] is not None:
                    vals[c] = datetime(vals[c].year, vals[c].month, vals[c].day)
                if n == "Valor Total dos Débitos" and isinstance(vals[c], (int, float)):
                    if r["_idx"] % 3 == 1:
                        s = f"{vals[c]:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        vals[c] = f"R$ {s}"
                    elif r["_idx"] % 3 == 2:
                        vals[c] = f"R$ {vals[c]:.2f}".replace(".", ",")
            ws_.append(vals)
        # formatos de data
        for c, n in enumerate(names, start=1):
            if n in ("Data", "Início do SLA", "Fim do SLA"):
                for row in ws_.iter_rows(min_row=2, min_col=c, max_col=c):
                    row[0].number_format = "dd/mm/yyyy" if n == "Data" else "dd/mm/yyyy hh:mm:ss"

    escrever(ws, rows)
    for key, sub in extras_sheets.items():
        w2 = wb.create_sheet({"termos": "Pós Corte com Termo", "negociacoes": "Pós Corte com Negociação"}[key])
        escrever(w2, sub)
    if frentes is not None:
        wf = wb.create_sheet("Frente de Serviço")
        wf.append(["Frente", "Nomenclatura"])
        for nom, fr in frentes:
            wf.append([fr, nom])
    wb.save(str(path))


def recortes(rows):
    return {
        "termos": [r for r in rows if TERMO_RE.search(r["Serviço adicionais resposta"] or "")],
        "negociacoes": [r for r in rows if (r["Negociou O Débito?"] or "").strip().lower() == "sim"],
    }


# ---------------------------------------------------------------------------
def montar_pequeno(out):
    """Planilha pequena, escrita à mão, com um caso-limite por linha."""
    names = cabecalho(random.Random(1), extra_dup=False)[:60]
    # mantém só colunas até a posição 40 + as obrigatórias remanescentes numa planilha compacta
    names = [None] * 30
    for i, name in enumerate(REQUIRED):
        names[i + 3] = name
    for i in range(30):
        if names[i] is None:
            names[i] = f"{EXTRA_PREFIX} {i}"
    base = {
        "Recurso": "AL-01", "Cód. Protocolo Origem": "OS1", "ID da Atividade": 1, "Matrícula": "1001",
        "Código/Descrição": "110010-VISTORIA PÓS CORTE", "Data": date(2026, 7, 3), "Status da Atividade": "Finalizada",
        "Nome do Solicitante": "Ana & <Souza>", "Cidade": "Cidade Norte", "Início do SLA": datetime(2026, 7, 3, 8),
        "Fim do SLA": datetime(2026, 7, 5, 8), "Tipo do Corte Realizado": "Cavalete",
        "Qual a situação do imóvel?": "Ocupado", "Irregularidade Encontrada?": "Não",
        "Valor Total dos Débitos": 100.0, "Negociou O Débito?": "Não", "Categoria": "Residencial",
        "Situação Do Imóvel": "Ativo", "Serviço adicionais resposta": "",
    }
    casos = [
        dict(),  # 1 atividade simples
        dict(**{"ID da Atividade": 2, "Negociou O Débito?": "Sim", "Serviço adicionais resposta": ""}),  # neg sem desdobro
        dict(**{"ID da Atividade": 3, "Negociou O Débito?": " sim ", "Serviço adicionais resposta": "   "}),  # neg sem desdobro (espaços)
        dict(**{"ID da Atividade": 4, "Negociou O Débito?": "SIM", "Serviço adicionais resposta": "120045 - Religação"}),  # neg com desdobro
        dict(**{"ID da Atividade": 5, "Serviço adicionais resposta": "110013 - Termo Serviços", "Irregularidade Encontrada?": "Sim"}),  # t11
        dict(**{"ID da Atividade": 6, "Serviço adicionais resposta": "120045;310013", "Status da Atividade": "Encerrada com Ocorrência"}),  # t31 no meio
        dict(**{"ID da Atividade": 7, "Serviço adicionais resposta": "110013 / 310013"}),  # ambos: conta 1
        dict(**{"ID da Atividade": 8, "Serviço adicionais resposta": "1100130", "Irregularidade Encontrada?": "Sim"}),  # sem termo
        dict(**{"ID da Atividade": 9, "Serviço adicionais resposta": "9310013"}),  # sem termo
        dict(**{"ID da Atividade": 10, "Irregularidade Encontrada?": "Sim", "Serviço adicionais resposta": ""}),  # irregularidade sem código
        dict(**{"ID da Atividade": 11, "Negociou O Débito?": "Sim", "Serviço adicionais resposta": "110013", "Valor Total dos Débitos": 1234.56}),  # neg + termo
        dict(**{"ID da Atividade": 12, "Nome do Solicitante": '<img src=x onerror="window.__xss=1">'}),  # nome com HTML
        dict(**{"ID da Atividade": 13, "Matrícula": "1001", "Data": date(2026, 8, 10)}),  # mesma matrícula, outra visita
        dict(**{"ID da Atividade": 14, "Negociou O Débito?": "Não", "Serviço adicionais resposta": "x=110013y"}),  # termo entre letras
        dict(**{"ID da Atividade": 15, "Recurso": "AL-X-02", "Cidade": "cidade norte"}),  # frente mais específica; caixa diferente
        dict(**{"ID da Atividade": 16, "Recurso": "QQ-01", "Negociou O Débito?": "Sim", "Valor Total dos Débitos": "R$ 1.000,50", "Serviço adicionais resposta": "130001"}),  # sem frente
        dict(**{"ID da Atividade": 17, "Data": date(2026, 9, 28), "Nome do Solicitante": "=HYPERLINK(\"x\")"}),  # texto com fórmula
        dict(**{"ID da Atividade": 18, "Serviço adicionais resposta": "Termo 110013.\nMais texto"}),  # quebra de linha, código com ponto
        dict(**{"ID da Atividade": 19, "Serviço adicionais resposta": "110013,5"}),
        # fora dos 9 códigos de serviço: não devem ser carregados (mesmo negociando e com termo)
        dict(**{"ID da Atividade": 20, "Código/Descrição": "180001 - OUTRO SERVIÇO", "Negociou O Débito?": "Sim", "Serviço adicionais resposta": "110013"}),
        dict(**{"ID da Atividade": 21, "Código/Descrição": "", "Status da Atividade": "Encerrada com Ocorrência"}),
        dict(**{"ID da Atividade": 22, "Código/Descrição": "1100100-CÓDIGO MAIOR", "Negociou O Débito?": "Sim"}),
        # status que não contam (só Finalizada e Encerrada com Ocorrência): mesmo negociando e com termo
        dict(**{"ID da Atividade": 24, "Status da Atividade": "Cancelada"}),
        dict(**{"ID da Atividade": 25, "Status da Atividade": "Paralisada", "Negociou O Débito?": "Sim", "Serviço adicionais resposta": "110013"}),  # código seguido de vírgula e dígito: 5 é dígito -> conta? (110013 seguido de ',') sim conta
    ]
    rows = []
    for i, c in enumerate(casos):
        r = dict(base)
        r.update(c)
        r["_idx"] = i
        rows.append(r)
    return names, rows


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures")
    out.mkdir(parents=True, exist_ok=True)
    small_only = "--small-only" in sys.argv

    # ---- pequeno (casos-limite) ----
    names, rows = montar_pequeno(out)
    rec = recortes(rows)
    escrever_xlsxwriter(out / "pequeno_xlsxwriter.xlsx", names, rows, rec)
    escrever_xlsxwriter(out / "pequeno_inline.xlsx", names, rows, rec, constant_memory=True)
    escrever_xlsxwriter(out / "pequeno_1904.xlsx", names, rows, rec, date_1904=True)
    escrever_xlsxwriter(out / "pequeno_datas_texto.xlsx", names, rows, rec, datas_como_texto=True)
    escrever_openpyxl(out / "pequeno_openpyxl.xlsx", names, rows, rec)
    escrever_xlsxwriter(out / "pequeno_sem_frente.xlsx", names, rows, rec, frentes=None)
    (out / "pequeno_esperados.json").write_text(json.dumps(esperados(rows), ensure_ascii=False, indent=1))

    # ---- arquivos com problemas ----
    escrever_xlsxwriter(out / "aba_outro_nome.xlsx", names, rows, {}, frentes=None, sheet_names={"base": "Dados"})
    # duas abas com as colunas esperadas e nenhuma chamada "Base": ambíguo
    wb = xlsxwriter.Workbook(str(out / "abas_ambiguas.xlsx"))
    for nm in ("Dados A", "Dados B"):
        w = wb.add_worksheet(nm)
        w.write_row(0, 0, names)
        w.write_row(1, 0, linha_completa(names, rows[0], None) if False else [str(rows[0].get(n, "")) for n in names])
    wb.close()
    nomes_sem = [n for n in names if n != "Negociou O Débito?"]
    escrever_xlsxwriter(out / "sem_coluna_negociou.xlsx", nomes_sem, rows, rec)
    nomes_sem = [n for n in names if n != "Serviço adicionais resposta"]
    escrever_xlsxwriter(out / "sem_coluna_servadic.xlsx", nomes_sem, rows, rec)
    nomes_sem = [n for n in names if n not in ("Status da Atividade", "Negociou O Débito?", "Serviço adicionais resposta")]
    escrever_xlsxwriter(out / "sem_indicadores.xlsx", nomes_sem, rows, {})
    nomes_sem2 = [n for n in names if n != "Categoria"]
    escrever_xlsxwriter(out / "sem_coluna_opcional.xlsx", nomes_sem2, rows, {})
    (out / "vazio.xlsx").write_bytes(b"")
    (out / "texto_disfarçado.xlsx").write_text("isto não é uma planilha\n")
    (out / "antigo_xls.xlsx").write_bytes(bytes.fromhex("D0CF11E0A1B11AE1") + b"\0" * 2048)
    good = (out / "pequeno_xlsxwriter.xlsx").read_bytes()
    (out / "truncado.xlsx").write_bytes(good[: len(good) // 2])
    with zipfile.ZipFile(out / "xlsb_falso.xlsx", "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.bin", b"\0\0\0")
    with zipfile.ZipFile(out / "zip_qualquer.xlsx", "w") as z:
        z.writestr("leia-me.txt", "não é uma planilha")
    with zipfile.ZipFile(out / "workbook_sem_partes.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
        with zipfile.ZipFile(out / "pequeno_xlsxwriter.xlsx") as src:
            for it in src.infolist():
                if it.filename == "xl/worksheets/sheet1.xml":
                    continue
                z.writestr(it, src.read(it.filename))
    # cabeçalho não reconhecido
    wb = Workbook()
    wb.active.title = "Base"
    wb.active.append(["Coluna A", "Coluna B"])
    wb.active.append([1, 2])
    wb.save(out / "sem_cabecalho.xlsx")

    # ---- arquivos "leves": poucas colunas, outra aba, título antes do cabeçalho ----
    leves = ["Recurso", "Data", "Status da Atividade", "Cidade", "Valor Total dos Débitos", "Negociou O Débito?", "Serviço adicionais resposta"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Resumo"
    ws.append(["Relatório Pós Corte (amostra sintética)"])
    ws.append([])
    ws.append(["gerado em 29/09/2026"])
    ws.append(leves)
    for r in [x for x in rows if em_escopo(x)]:
        vals = []
        for n in leves:
            v = r[n]
            if n == "Data":
                v = datetime(v.year, v.month, v.day)
            vals.append(v)
        ws.append(vals)
    for row in ws.iter_rows(min_row=5, min_col=2, max_col=2):
        row[0].number_format = "dd/mm/yyyy"
    wb.save(out / "leve_titulo_linha4.xlsx")
    # colunas com outros nomes (exigem nomes alternativos)
    ren = {"Recurso": "Equipe", "Data": "Dt", "Status da Atividade": "Situação", "Cidade": "Município",
           "Valor Total dos Débitos": "Débito", "Negociou O Débito?": "Negociou?", "Serviço adicionais resposta": "Serviços adicionais"}
    wb = Workbook()
    ws = wb.active
    ws.title = "Planilha1"
    ws.append([ren[n] for n in leves])
    for r in [x for x in rows if em_escopo(x)]:
        ws.append([datetime(r[n].year, r[n].month, r[n].day) if n == "Data" else r[n] for n in leves])
    wb.save(out / "leve_nomes_diferentes.xlsx")

    # ---- pasta com versões (deduplicação) ----
    pasta = out / "pasta_dedup"
    (pasta / "sub").mkdir(parents=True, exist_ok=True)
    rng = random.Random(11)
    spec = dict(exoc=20, neg=12, termos=15, neg_e_termo=3, sem_desdobro=1, decoy_num=4, irreg_sem_codigo=5, neg_decoy=2, outros=0)
    rows_a = nova_matriz(rng, 200, spec)
    esc = dict
    escrever_xlsxwriter(pasta / "snapshot_antigo.xlsx", cabecalho(rng), rows_a, {})
    # snapshot novo: 150 linhas repetidas (uma com status alterado) + 40 novas
    rows_b = [dict(r) for r in rows_a[:150]]
    rows_b[0]["Status da Atividade"] = "Encerrada com Ocorrência" if rows_b[0]["Status da Atividade"] == "Finalizada" else "Finalizada"
    novos = nova_matriz(random.Random(99), 40, dict(exoc=4, neg=3, termos=4, neg_e_termo=1, sem_desdobro=0, decoy_num=1, irreg_sem_codigo=1, neg_decoy=0, outros=0))
    for k, r in enumerate(novos):
        r["ID da Atividade"] = 900000 + k
    rows_b += novos
    escrever_xlsxwriter(pasta / "sub" / "snapshot_novo.xlsx", cabecalho(rng), rows_b, {})
    (pasta / "~$snapshot_novo.xlsx").write_bytes(b"lock")  # arquivo temporário do Excel
    (pasta / "anotacoes.txt").write_text("ignorar")
    (pasta / "antigo.xls").write_bytes(b"x")
    (pasta / "corrompido.xlsx").write_bytes(good[:300])
    meta = {
        "antigo": {"linhas": len(rows_a)}, "novo": {"linhas": len(rows_b)},
        "status_alterado_id": rows_b[0]["ID da Atividade"], "status_novo": rows_b[0]["Status da Atividade"],
        "unicos": len({r["ID da Atividade"] for r in rows_a + rows_b}),
        "duplicatas": len(rows_a) + len(rows_b) - len({r["ID da Atividade"] for r in rows_a + rows_b}),
    }
    final = {r["ID da Atividade"]: r for r in rows_a}
    final.update({r["ID da Atividade"]: r for r in rows_b})
    meta["esperados"] = esperados(list(final.values()))
    (pasta / "_esperados.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

    if small_only:
        return

    # ---- grande: 8.136 linhas x 296 colunas ----
    rng = random.Random(2026)
    spec = dict(exoc=675, neg=230, termos=389, neg_e_termo=25, sem_desdobro=2, decoy_num=40, irreg_sem_codigo=60, neg_decoy=15, outros=0)
    rows = nova_matriz(rng, 8136, spec)
    fora = []
    for k in range(50):  # outros serviços: devem ser ignorados sem alterar os números
        r = dict(rng.choice(rows))
        r["ID da Atividade"] = 990000 + k
        r["Código/Descrição"] = rng.choice(["180001 - OUTRO SERVIÇO", "120045 - RELIGAÇÃO", ""])
        r["Negociou O Débito?"] = "Sim"
        r["Serviço adicionais resposta"] = "110013"
        r["_idx"] = 900000 + k
        fora.append(r)
    rows = rows + fora
    names = cabecalho(rng)
    rec = recortes(rows)
    escrever_xlsxwriter(out / "grande_sintetico.xlsx", names, rows, rec)
    escrever_xlsxwriter(out / "grande_sintetico_inline.xlsx", names, rows, rec, constant_memory=True)
    (out / "grande_esperados.json").write_text(json.dumps(esperados(rows), ensure_ascii=False, indent=1))
    print("ok", out)


if __name__ == "__main__":
    main()
