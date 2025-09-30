# import json, traceback

# def handler(event, context):
#     try:
#         return {
#             "statusCode": 200,
#             "headers": {
#                 "content-type": "application/json",
#                 "access-control-allow-origin": "*",
#             },
#             "body": json.dumps({"ok": True, "requestId": getattr(context, "aws_request_id", None)}),
#         }
#     except Exception as e:
#         print("ERROR:", repr(e))
#         print(traceback.format_exc())
#         return {
#             "statusCode": 500,
#             "headers": {"content-type": "application/json", "access-control-allow-origin": "*"},
#             "body": json.dumps({"ok": False, "error": str(e)}),
#         }
# #

import json
import os

def handler(event, context):
    # Node側から { "input": {...} } が来る想定
    try:
        # eventはbytesで来る場合があるのでハンドリング
        if isinstance(event, (bytes, bytearray)):
            event = json.loads(event.decode('utf-8'))
        elif isinstance(event, str):
            event = json.loads(event)

        data = event.get('input', {})

        # ▼ここでPythonライブラリを使った本処理
        # 例: 結果を組み立て
        result = {
            "ok": True,
            "echo": data,
            "pyVersion": os.environ.get("AWS_EXECUTION_ENV", "unknown"),
            "message": "Hello from Python!",
        }

        # Nodeが JSON.parse するので、そのまま辞書を返す（プロキシではない）
        return result

    except Exception as e:
        # 例外はNode側に500相当として伝わる
        return {"ok": False, "error": str(e)}
