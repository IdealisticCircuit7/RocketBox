import sys
import json
import os

ARQUIVO_BASE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets_knowledge_base.json",
)


def avaliar_compatibilidade(engine_destino, formato_asset):
    formato = (formato_asset or "").strip().lower()
    engine = (engine_destino or "").strip()

    if engine == "Unreal Engine 5":
        if formato == ".blend":
            return (
                "Recomendado com RESSALVA.",
                "ATENÇÃO: A Unreal Engine 5 não importa .blend nativamente. Recomendado exportar para .fbx ou .glb.",
                ["RULE_UE5_BLEND_EXPORT"],
                ["Exportação necessária para .fbx antes da importação na UE5."],
                ["Converter/exportar para .fbx preservando rigging e escala."],
            )
        if formato in (".fbx", ".uasset"):
            return (
                "Compatibilidade Nativa.",
                f"O formato {formato} possui suporte nativo na Unreal Engine 5.",
                ["RULE_UE5_NATIVE_FORMAT"],
                [],
                [],
            )
        if formato == ".glb":
            return (
                "Compatível via Interchange.",
                "A Unreal Engine 5 suporta .glb/.gltf via pipeline Interchange.",
                ["RULE_UE5_GLTF_INTERCHANGE"],
                [],
                [],
            )

    if engine == "Unity":
        if formato == ".uasset":
            return (
                "Incompatível diretamente.",
                "Arquivos .uasset pertencem ao formato proprietário da Unreal Engine e não são importados pela Unity.",
                ["RULE_UNITY_UASSET_INCOMPATIBLE"],
                ["Formato proprietário da Unreal Engine."],
                ["Exportar malha/texturas fonte para .fbx ou .glb."],
            )
        if formato in (".fbx", ".obj", ".blend", ".png", ".jpg"):
            return (
                "Compatibilidade Suportada.",
                f"O formato {formato} é aceito pelo pipeline de importação da Unity.",
                ["RULE_UNITY_SUPPORTED"],
                [],
                [],
            )

    return (
        "Recomendado.",
        f"Formato {formato or 'não informado'} avaliado segundo regras gerais da base OCSIS.",
        ["RULE_GENERAL_KNOWLEDGE_MATCH"],
        [],
        [],
    )


def motor_de_inferencia(engine_destino, necessidade_categoria, formato_desejado):
    if os.path.exists(ARQUIVO_BASE):
        with open(ARQUIVO_BASE, "r", encoding="utf-8") as f:
            base_fatos = json.load(f)
    else:
        base_fatos = []

    recomendacoes = []
    categoria_norm = (necessidade_categoria or "").strip().lower()
    formato_norm = (formato_desejado or "").strip().lower()

    for asset in base_fatos:
        asset_cat = (asset.get("categoria") or "").strip().lower()
        asset_fmt = (asset.get("formato") or "").strip().lower()

        if categoria_norm and categoria_norm != "qualquer" and asset_cat != categoria_norm:
            continue
        if formato_norm and formato_norm != "qualquer" and asset_fmt != formato_norm:
            continue

        diagnostico, explicacao_regra, regras, avisos, operacoes = avaliar_compatibilidade(
            engine_destino, asset.get("formato", "")
        )

        rec = {
            "id": asset.get("id"),
            "nome": asset.get("nome"),
            "caminho": asset.get("caminho"),
            "formato": asset.get("formato"),
            "categoria": asset.get("categoria"),
            "engine_foco": asset.get("engine_foco"),
            "status_rigging": asset.get("status_rigging"),
            "diagnostico": diagnostico,
            "explicacao": (
                f"O asset '{asset.get('nome')}' pertence à categoria '{asset.get('categoria')}'. "
                f"{explicacao_regra}"
            ),
            "regras_aplicadas": ["RULE_CATEGORY_MATCH", *regras],
            "avisos": avisos,
            "operacoes_recomendadas": operacoes,
            "evidencias": [
                f"Registro '{asset.get('id')}' encontrado em assets_knowledge_base.json",
                f"Formato declarado na base: {asset.get('formato')}",
            ],
        }
        recomendacoes.append(rec)

    return recomendacoes


if __name__ == "__main__":
    engine = sys.argv[1] if len(sys.argv) > 1 else "Qualquer"
    categoria = sys.argv[2] if len(sys.argv) > 2 else "Qualquer"
    formato = sys.argv[3] if len(sys.argv) > 3 else "Qualquer"

    resultados = motor_de_inferencia(engine, categoria, formato)
    print(json.dumps(resultados, ensure_ascii=False))
