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
import collections
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


def chave_mat(v):
    """Matrícula normalizada: sem espaços, sem ".0" final, em caixa alta e sem zeros à esquerda quando só tem dígitos."""
    t = re.sub(r"\s+", "", str(v if v is not None else "").strip()).upper()
    t = re.sub(r"\.0+$", "", t)
    return (t.lstrip("0") or "0") if t.isdigit() else t


def matriculas_neg(rows):
    """Matrículas distintas que negociaram (mesmo escopo de serviços e status dos esperados)."""
    ms = set()
    for r in rows:
        if em_escopo(r) and r["Status da Atividade"] in STATUS_CONTADOS and (r["Negociou O Débito?"] or "").strip().lower() == "sim":
            m = chave_mat(r["Matrícula"])
            if m:
                ms.add(m)
    return ms


CAD_CAB = ["NUM_LIGACAO", "NOM_CLIENTE", "CIDADE", "TIPO_FATURAMENTO", "QTD_ECO_RES", "QTD_ECO_COM", "QTD_ECO_IND", "QTD_ECO_PUB", "TOTAL_ECO", "Mês/Ano", "SIT_LIG"]


def escrever_cadastro(path, linhas, nome_aba="Export", mes_padrao="10/2026"):
    """Cadastro de economias SINTÉTICO (aba Export, colunas parecidas com o export real, inclusive Mês/Ano em texto "MM/AAAA").
    linhas: (matrícula, total ou None) ou (matrícula, total ou None, "MM/AAAA"); sem o mês, vale mes_padrao (o export real traz um só mês)."""
    wb = Workbook()
    ws = wb.active
    ws.title = nome_aba
    ws.append(CAD_CAB)
    for i, lin in enumerate(linhas):
        mat, total = lin[0], lin[1]
        mes = lin[2] if len(lin) > 2 else mes_padrao
        res = total if total is not None else None
        ws.append([mat, f"Cliente sintético {i}", "Cidade Norte", "MEDIDO", res, 0 if total is not None else None, 0 if total is not None else None, 0 if total is not None else None, total, mes, "ATIVA"])
    wb.save(path)


def consulta_cadastro(linhas, mat, mes):
    """Cadastro com vários meses, contagem independente: (motivo, total) de uma matrícula num mês "AAAA-MM".
    Vale o mês exato; sem ele, o mais próximo (empate: o mais antigo). Repetida no mesmo mês: "rep"; sem total ou ausente: "sem"."""
    def ordem(ym):
        a, m = ym.split("-")
        return int(a) * 12 + int(m) - 1

    grupos = {}
    for m, tot, mes_l in linhas:
        k = chave_mat(m)
        if not k:
            continue
        ym = f"{mes_l[3:]}-{mes_l[:2]}"
        g = grupos.setdefault((k, ym), {"n": 0, "total": tot})
        g["n"] += 1
    cand = [(ym, g) for (k, ym), g in grupos.items() if k == chave_mat(mat)]
    if not cand:
        return ("sem", None)
    alvo = ordem(mes)
    ym, g = min(cand, key=lambda c: (abs(ordem(c[0]) - alvo), ordem(c[0])))
    if g["n"] > 1:
        return ("rep", None)
    if g["total"] is None:
        return ("sem", None)
    return ("ok", g["total"])


def esperados_cadastro_meses(linhas):
    """Estatísticas do Cadastro com vários meses (matrícula/mês é a unidade) e consultas esperadas."""
    grupos = collections.Counter()
    total = {}
    sem_matricula = 0
    for m, tot, mes_l in linhas:
        k = chave_mat(m)
        if not k:
            sem_matricula += 1
            continue
        ym = f"{mes_l[3:]}-{mes_l[:2]}"
        grupos[(k, ym)] += 1
        total[(k, ym)] = tot
    meses = sorted({ym for _, ym in grupos})
    consultas = []
    for m in ["1001", "2002", "3003", "00004", "5005", "9999"]:
        for mes in ["2026-01", "2026-07", "2026-08", "2026-09", "2026-12"]:
            motivo, tot = consulta_cadastro(linhas, m, mes)
            consultas.append({"mat": m, "mes": mes, "motivo": motivo, "eco": tot})
    return {
        "linhas": sum(grupos.values()) + sem_matricula, "semMatricula": sem_matricula, "distintas": len({k for k, _ in grupos}),
        "repetidas": sum(1 for n in grupos.values() if n > 1), "linhasRepetidas": sum(n for n in grupos.values() if n > 1),
        "semTotal": sum(1 for g, n in grupos.items() if n == 1 and total[g] is None),
        "usadas": sum(1 for g, n in grupos.items() if n == 1 and total[g] is not None),
        "meses": meses, "consultas": consultas,
    }


AVULSO_CAB = ["N. da Ligacao", "Nome Cliente", "Categoria", "Qtd. Economia Residencial", "Qtd. Economia Comercial", "Qtd. Economia Industrial",
              "Qtd. Economia Publica", "Qtd. Economia Outros", "Rubrica", "Valor Parcela", "Referencia de Leitura", "Situacao Ligacao"]


def escrever_avulso(path, linhas, cp1252=False, bom=True, sep_linha=True, com_mes=True):
    """CSV de Serviço avulso SINTÉTICO, como o export real (separador ";", CRLF, opcionalmente BOM e linha "sep=;").
    linhas: (matrícula, residencial, comercial, industrial, pública, outros, rubrica, "MM/AAAA")."""
    import csv
    import io
    cab = AVULSO_CAB if com_mes else [c for c in AVULSO_CAB if c != "Referencia de Leitura"]
    buf = io.StringIO(newline="")
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    if sep_linha:
        buf.write("sep=;\r\n")
    w.writerow(cab)
    for i, (mat, res, com, ind, pub, outros, rubrica, mes) in enumerate(linhas):
        lin = [mat, f"Cliente sintético {i}", "RESIDENCIAL", res, com, ind, pub, outros, rubrica, "12,34", mes, "C-Cortada"]
        if not com_mes:
            del lin[AVULSO_CAB.index("Referencia de Leitura")]
        w.writerow(lin)
    texto = buf.getvalue()
    dados = texto.encode("cp1252") if cp1252 else texto.encode("utf-8")
    if bom and not cp1252:
        dados = b"\xef\xbb\xbf" + dados
    path.write_bytes(dados)


def consulta_fontes(fontes, mat, mes):
    """Contagem independente com várias fontes de total de economias, na ordem de prioridade (Serviço avulso, depois Cadastro).
    Cada fonte: lista de (matrícula, total ou None, "MM/AAAA"). Em cada uma vale o mês exato ou o mais próximo (empate: o mais antigo);
    matrícula repetida no mês é desconsiderada e passa para a próxima fonte; a primeira com total aproveitável vale."""
    def ordem(ym):
        a, m = ym.split("-")
        return int(a) * 12 + int(m) - 1

    alvo = ordem(mes)
    motivo = "sem"
    for linhas in fontes:
        grupos = {}
        for m, tot, mes_l in linhas:
            k = chave_mat(m)
            if not k:
                continue
            ym = f"{mes_l[3:]}-{mes_l[:2]}"
            g = grupos.setdefault((k, ym), {"n": 0, "total": tot})
            g["n"] += 1
        cand = [(ym, g) for (k, ym), g in grupos.items() if k == chave_mat(mat)]
        if not cand:
            continue
        ym, g = min(cand, key=lambda c: (abs(ordem(c[0]) - alvo), ordem(c[0])))
        if g["n"] > 1:
            motivo = "rep"
            continue
        if g["total"] is None:
            continue
        return ("ok", g["total"])
    return (motivo, None)


def negociacoes_por_matricula(rows, mats):
    """Nº de negociações e valor informado (só negociações com valor) das matrículas pedidas, no escopo dos esperados."""
    n = collections.Counter()
    valor = collections.defaultdict(float)
    for r in rows:
        if em_escopo(r) and r["Status da Atividade"] in STATUS_CONTADOS and (r["Negociou O Débito?"] or "").strip().lower() == "sim":
            m = chave_mat(r["Matrícula"])
            if m in mats:
                n[m] += 1
                v = r["Valor Total dos Débitos"]
                if isinstance(v, str):
                    v = float(re.sub(r"[^\d,]", "", v).replace(",", ".") or 0)
                if v is not None:
                    valor[m] += v
    return n, valor


def esperados_cadastro(linhas, mats_neg, rows=None):
    """Contagem independente do Cadastro: matrícula que aparece mais de uma vez no arquivo é desconsiderada."""
    cont = collections.Counter()
    total = {}
    sem_matricula = 0
    for mat, tot in linhas:
        k = chave_mat(mat)
        if not k:
            sem_matricula += 1
            continue
        cont[k] += 1
        total[k] = tot
    unicas = {k: total[k] for k, n in cont.items() if n == 1 and total[k] is not None}
    fora = sorted(m for m in mats_neg if m not in unicas and cont.get(m, 0) <= 1)
    extra = {"foraLista": fora}
    if rows is not None:
        n_neg, v_neg = negociacoes_por_matricula(rows, set(fora))
        extra.update({"foraNegociacoes": sum(n_neg.values()), "foraValor": round(sum(v_neg.values()), 2)})
    return {**extra,
        "linhas": sum(cont.values()) + sem_matricula, "semMatricula": sem_matricula, "distintas": len(cont),
        "repetidas": sum(1 for n in cont.values() if n > 1), "linhasRepetidas": sum(n for n in cont.values() if n > 1),
        "semTotal": sum(1 for k, n in cont.items() if n == 1 and total[k] is None), "usadas": len(unicas), "somaUnicas": sum(unicas.values()),
        # cada matrícula que negociou é, no mínimo, 1 economia: o TOTAL_ECO do Cadastro (se único e com total) ou 1
        "economias": sum(max(1, unicas[m]) if m in unicas else 1 for m in mats_neg),
        "matriculasUsadas": sum(1 for m in mats_neg if m in unicas),
        "peloMinimo": sum(1 for m in mats_neg if m not in unicas),
        "negRepetidas": sum(1 for m in mats_neg if cont.get(m, 0) > 1),
        "negSemCadastro": sum(1 for m in mats_neg if m not in unicas and cont.get(m, 0) <= 1),
    }


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
           "debito": 0.0, "debitoTotal": 0.0, "matriculasNeg": 0, "negSemMatricula": 0, "negETermo": 0, "porMes": {}, "porFrente": {}, "porCidade": {}, "porEquipe": {}}
    mats_neg = set()  # matrículas distintas que negociaram

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
        if v is not None:
            out["debitoTotal"] += v  # débito informado de todas as atividades (negociadas ou não)
        if neg and v is not None:
            out["debito"] += v
        if neg:
            m = chave_mat(r["Matrícula"])
            if m:
                mats_neg.add(m)
            else:
                out["negSemMatricula"] += 1
        m = out["porMes"].setdefault(mes, {"atividades": 0, "neg": 0, "termos": 0})
        m["atividades"] += 1
        m["neg"] += neg
        m["termos"] += termo
        out["porFrente"][f] = out["porFrente"].get(f, 0) + 1
        out["porCidade"][r["Cidade"]] = out["porCidade"].get(r["Cidade"], 0) + 1
        out["porEquipe"][r["Recurso"]] = out["porEquipe"].get(r["Recurso"], 0) + 1
    out["debito"] = round(out["debito"], 2)
    out["debitoTotal"] = round(out["debitoTotal"], 2)
    out["matriculasNeg"] = len(mats_neg)
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
    names[26], names[27] = "Fez o corte novamente", "Onde Foi Feito O Corte?"
    base = {
        "Fez o corte novamente": "NÃO", "Onde Foi Feito O Corte?": "",
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
    # recorte (corte refeito): só SIM conta; o tipo vem de "Onde Foi Feito O Corte?"
    recorte_por_id = {2: ("SIM", "RAMAL"), 3: ("SIM", "CAVALETE SIMPLES"), 4: ("SIM", "RAMAL"), 5: ("NÃO", "RAMAL"),
                      6: ("SIM", ""), 7: ("sim", "Ramal")}
    rows = []
    for i, c in enumerate(casos):
        r = dict(base)
        r.update(c)
        if r["ID da Atividade"] in recorte_por_id:
            r["Fez o corte novamente"], r["Onde Foi Feito O Corte?"] = recorte_por_id[r["ID da Atividade"]]
        r["_idx"] = i
        rows.append(r)
    return names, rows



def montar_bases(out):
    """Bases enviadas a campo (páginas "Bases de campo"): protocolo/matrícula + colunas livres."""
    import xlsxwriter
    cab_ = ["Cód. Protocolo Origem", "Matrícula", "Cidade", "Endereço", "Data do corte"]
    linhas = [
        ["OS1", "1001", "Cidade Norte", "Rua A, 10", date(2026, 9, 1)],
        ["OS2", "2002", "Cidade Norte", "Rua B, 20", date(2026, 9, 1)],
        ["OS3", "3003", "Cidade Sul", "Rua C, 30", date(2026, 9, 2)],
        ["OS2", "2002", "Cidade Norte", "Rua B, 20", date(2026, 9, 1)],  # repetida
        ["", "", "Cidade Sul", "Sem chave", date(2026, 9, 2)],
    ]
    wb = xlsxwriter.Workbook(str(out / "Base_Campo_28_09_2026.xlsx"))
    fmt = wb.add_format({"num_format": "dd/mm/yyyy"})
    ws = wb.add_worksheet("Base")
    for c, n in enumerate(cab_):
        ws.write(0, c, n)
    for r, l in enumerate(linhas, start=1):
        for c, v in enumerate(l):
            if isinstance(v, date):
                ws.write_datetime(r, c, datetime(v.year, v.month, v.day), fmt)
            elif v != "":
                ws.write(r, c, v)
    wb.close()
    # base com várias abas: a primeira é de outro serviço; a de pós-corte usa NUM_LIGACAO no lugar de Matrícula
    wb = xlsxwriter.Workbook(str(out / "Base_Multi_Abas_25_09.xlsx"))
    ws = wb.add_worksheet("Unijato ")
    for c, n in enumerate(["Recurso", "Cód. Protocolo Origem", "Matrícula", "Código/Descrição"]):
        ws.write(0, c, n)
    ws.write_row(1, 0, ["R1", "1896574/2026-1", "100625984", "204005-SUBSTITUIÇÃO DE HD (SEM CUSTO)"])
    ws = wb.add_worksheet("Resumo ")
    ws.write_row(0, 0, ["Projeto", "Cidade", "Qtd"])
    ws.write_row(1, 0, ["Sub. Preventiva", "Aperibé", 13])
    ws = wb.add_worksheet("Pós Corte")
    for c, n in enumerate(["NUM_LIGACAO", "Zona ", "Cód. Protocolo Origem", "Cidade ", "DESCRICAO"]):
        ws.write(0, c, n)
    ws.write_row(1, 0, [1001, 14, "OS1", "RIO BONITO", "CAVALETE"])
    ws.write_row(2, 0, [3003, 5, "OS3", "CANTAGALO", "RAMAL"])
    wb.close()
    wb = xlsxwriter.Workbook(str(out / "Base_Sem_Chave.xlsx"))
    ws = wb.add_worksheet("Base")
    for c, n in enumerate(["Cidade", "Endereço"]):
        ws.write(0, c, n)
    ws.write(1, 0, "X"); ws.write(1, 1, "Y")
    wb.close()

def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures")
    out.mkdir(parents=True, exist_ok=True)
    small_only = "--small-only" in sys.argv

    montar_bases(out)
    # ---- pequeno (casos-limite) ----
    names, rows = montar_pequeno(out)
    rec = recortes(rows)
    escrever_xlsxwriter(out / "pequeno_xlsxwriter.xlsx", names, rows, rec)
    escrever_xlsxwriter(out / "pequeno_inline.xlsx", names, rows, rec, constant_memory=True)
    escrever_xlsxwriter(out / "pequeno_1904.xlsx", names, rows, rec, date_1904=True)
    escrever_xlsxwriter(out / "pequeno_datas_texto.xlsx", names, rows, rec, datas_como_texto=True)
    escrever_openpyxl(out / "pequeno_openpyxl.xlsx", names, rows, rec)
    escrever_xlsxwriter(out / "pequeno_sem_frente.xlsx", names, rows, rec, frentes=None)
    # Cadastro de economias do pequeno: todas as negociações são da matrícula 1001 (3 economias); 2002 repete (desconsiderada);
    # "00004" tem zeros à esquerda; 5005 não tem TOTAL_ECO; a última linha não tem matrícula
    cad_pequeno = [(1001, 3), (2002, 4), (2002, 4), (3003, 1), ("00004", 2), (5005, None), (None, 9)]
    escrever_cadastro(out / "Cadastro_pequeno.xlsx", cad_pequeno)
    # Cadastro com vários meses (um registro por matrícula e mês): o total vale do mês da negociação; repetida só no mesmo mês
    cad_meses = [(1001, 3, "07/2026"), (1001, 4, "08/2026"), (1001, 4, "09/2026"), (2002, 4, "07/2026"), (2002, 4, "07/2026"),
                 (2002, 5, "08/2026"), (3003, 2, "08/2026"), ("00004", 2, "07/2026"), (5005, None, "07/2026"), (5005, 6, "09/2026"),
                 (None, 9, "07/2026")]
    escrever_cadastro(out / "Cadastro_meses.xlsx", cad_meses)
    (out / "cadastro_meses_esperados.json").write_text(json.dumps(esperados_cadastro_meses(cad_meses), ensure_ascii=False, indent=1))
    # Serviço avulso (CSV do faturamento): 07/2026 como o export real (UTF-8 com BOM, linha "sep=;"); 08/2026 em Windows-1252, sem BOM,
    # sem a linha "sep=;" e sem a coluna do mês (o mês vem do nome do arquivo). 1001 vale 4 em julho e 5 em agosto (o Cadastro dá 3 em out/2026).
    av07 = [("1001", 2, 2, 0, 0, 0, "COBRANÇA DE PARCELAS", "07/2026"), ("2002", 1, 0, 0, 0, 0, "CORTE NO CAVALETE", "07/2026"),
            ("2002", 1, 0, 0, 0, 0, "RELIGACAO NO CAVALETE", "07/2026"), ("3003", 1, 0, 0, 0, 0, "CORTE NO REGISTRO", "07/2026"),
            ("7777", 3, 2, 0, 0, 0, "COBRANÇA DE PARCELAS", "07/2026"), ("00004", 2, 0, 0, 0, 0, "CORTE NO REGISTRO", "07/2026")]
    av08 = [("1001", 3, 2, 0, 0, 0, "COBRANÇA DE PARCELAS", None), ("3003", 2, 0, 0, 0, 0, "RELIGAÇÃO NO CAVALETE", None)]
    escrever_avulso(out / "Servico_avulso_07-2026.csv", av07)
    escrever_avulso(out / "Servico_avulso_08-2026.csv", av08, cp1252=True, sep_linha=False, com_mes=False)
    (out / "outro_relatorio.csv").write_text("a;b;c\r\n1;2;3\r\n", encoding="utf-8")  # CSV que não é o Serviço avulso: deve ser ignorado
    (out / "vazio.csv").write_bytes(b"")  # CSV vazio (ou ainda sincronizando): precisa aparecer como erro, não ser ignorado
    lin_av = [(m, res + com + ind + pub + oth, mes) for m, res, com, ind, pub, oth, _, mes in av07] + \
             [(m, res + com + ind + pub + oth, "08/2026") for m, res, com, ind, pub, oth, _, _ in av08]
    cad_pq = [(m, t, "10/2026") for m, t in cad_pequeno]  # Cadastro_pequeno tem Mês/Ano = 10/2026 em todas as linhas
    consultas = []
    for m in ["1001", "2002", "3003", "7777", "00004", "5005", "9999"]:
        for mes in ["2026-01", "2026-07", "2026-08", "2026-09", "2026-12"]:
            motivo, tot = consulta_fontes([lin_av, cad_pq], m, mes)
            consultas.append({"mat": m, "mes": mes, "motivo": motivo, "eco": tot})
    (out / "avulso_esperados.json").write_text(json.dumps({
        "07": {"linhas": 6, "distintas": 5, "repetidas": 1, "linhasRepetidas": 2, "semTotal": 0, "usadas": 4, "meses": ["2026-07"]},
        "08": {"linhas": 2, "distintas": 2, "repetidas": 0, "linhasRepetidas": 0, "semTotal": 0, "usadas": 2, "meses": ["2026-08"]},
        "consultas": consultas}, ensure_ascii=False, indent=1))
    esp_p = esperados(rows)
    esp_p["cadastro"] = esperados_cadastro(cad_pequeno, matriculas_neg(rows), rows)
    (out / "pequeno_esperados.json").write_text(json.dumps(esp_p, ensure_ascii=False, indent=1))
    # arquivo "Cadastro" sem a coluna TOTAL_ECO (e que também não é base de atividades): recusado com mensagem clara
    wb_inv = Workbook()
    wb_inv.active.title = "Export"
    wb_inv.active.append(["NUM_LIGACAO", "NOM_CLIENTE", "CIDADE"])
    wb_inv.active.append([1001, "Cliente sintético", "Cidade Norte"])
    wb_inv.save(out / "Cadastro_sem_colunas.xlsx")
    # pasta como no OneDrive do usuário: o nome "Cadastro" está na PASTA e o arquivo mantém o nome original do export
    pc = out / "pasta_cadastro"
    (pc / "Cadastro").mkdir(parents=True, exist_ok=True)
    (pc / "atividades.xlsx").write_bytes((out / "pequeno_xlsxwriter.xlsx").read_bytes())
    (pc / "Cadastro" / "data (16).xlsx").write_bytes((out / "Cadastro_pequeno.xlsx").read_bytes())

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
    # Cadastro do grande: das matrículas que negociaram, ~60% únicas com total, ~15% repetidas, ~10% sem total e ~15% ausentes
    rng_c = random.Random(7)
    negs = sorted(matriculas_neg(rows))
    cad_grande = []
    for m in negs:
        x = rng_c.random()
        if x < 0.60:
            cad_grande.append((int(m), rng_c.choice([1, 1, 1, 2, 3, 12])))
        elif x < 0.75:
            cad_grande += [(int(m), 1), (int(m), 2)]
        elif x < 0.85:
            cad_grande.append((int(m), None))
    cad_grande += [(rng_c.randrange(1000000, 1900000), rng_c.choice([1, 1, 2, 4])) for _ in range(500)]  # outras matrículas do cadastro
    rng_c.shuffle(cad_grande)
    escrever_cadastro(out / "Cadastro_grande.xlsx", cad_grande)
    esp_g = esperados(rows)
    esp_g["cadastro"] = esperados_cadastro(cad_grande, matriculas_neg(rows), rows)
    (out / "grande_esperados.json").write_text(json.dumps(esp_g, ensure_ascii=False, indent=1))
    print("ok", out)


if __name__ == "__main__":
    main()
