import json
import boto3
import os
from io import BytesIO
import base64
from PIL import Image, ImageChops
import fitz  # PyMuPDF
import tempfile

s3_client = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

def pdf_to_png(pdf_bytes, page_num=0):
    """PDFの特定のページをPNGに変換"""
    try:
        # 一時ファイルにPDFを保存
        with tempfile.NamedTemporaryFile(suffix='.pdf') as tmp:
            tmp.write(pdf_bytes)
            tmp.flush()
            
            # PyMuPDFでPDFを開く
            doc = fitz.open(tmp.name)
            page = doc.load_page(page_num)
            
            # ページを画像に変換
            pix = page.get_pixmap()
            img_data = pix.tobytes("png")
            
            return img_data
    except Exception as e:
        print(f"PDF to PNG conversion error: {str(e)}")
        raise

def compare_images(img1_bytes, img2_bytes):
    """2つの画像を比較して差分を抽出"""
    try:
        # バイト列から画像を読み込み
        img1 = Image.open(BytesIO(img1_bytes))
        img2 = Image.open(BytesIO(img2_bytes))
        
        # 画像サイズが異なる場合は同じサイズにリサイズ
        if img1.size != img2.size:
            img2 = img2.resize(img1.size)
            
        # 差分画像を作成
        diff = ImageChops.difference(img1.convert('RGB'), img2.convert('RGB'))
        
        # 差分画像をバイト列に変換
        output = BytesIO()
        diff.save(output, format='PNG')
        diff_bytes = output.getvalue()
        
        # 類似度の計算（簡易版）
        diff_img = diff.convert('L')
        diff_percentage = (sum(i > 10 for i in diff_img.getdata()) / (diff_img.width * diff_img.height)) * 100
        
        return diff_bytes, diff_percentage
    except Exception as e:
        print(f"Image comparison error: {str(e)}")
        raise

def handler(event, context):
    print("Event:", event)

    # debug
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        },
        "body": json.dumps({"message": "Debugging mode active"}),
    }
    
    try:
        # リクエストボディをパース
        body = json.loads(event.get('body', '{}'))
        repo = body.get('repo')
        key = body.get('key')
        
        if not repo or not BUCKET_NAME:
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                },
                "body": json.dumps({"message": "repo or bucket missing"}),
            }
        
        print(f"Processing diff for repo: {repo}, bucket: {BUCKET_NAME}")
        
        # リポジトリ内のPDFファイル一覧を取得
        prefix = f"data/{repo}/"
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
        
        pdf_files = []
        for obj in response.get('Contents', []):
            if obj['Key'].endswith('.pdf'):
                pdf_files.append(obj['Key'])
        
        pdf_files.sort(key=lambda x: s3_client.head_object(Bucket=BUCKET_NAME, Key=x)['LastModified'], reverse=True)
        
        if len(pdf_files) < 2:
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                },
                "body": json.dumps({"message": "Need at least 2 PDF files to compare"}),
            }
        
        # 最新の2つのPDFファイルを取得
        new_pdf_key = pdf_files[0]
        old_pdf_key = pdf_files[1]
        
        print(f"Comparing {new_pdf_key} with {old_pdf_key}")
        
        # S3からPDFファイルを取得
        new_pdf_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=new_pdf_key)
        old_pdf_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=old_pdf_key)
        
        new_pdf_bytes = new_pdf_obj['Body'].read()
        old_pdf_bytes = old_pdf_obj['Body'].read()
        
        # PDFをPNGに変換
        new_png_bytes = pdf_to_png(new_pdf_bytes)
        old_png_bytes = pdf_to_png(old_pdf_bytes)
        
        # 差分を計算
        diff_png_bytes, diff_percentage = compare_images(new_png_bytes, old_png_bytes)
        
        # 差分画像をS3にアップロード
        diff_key = f"data/{repo}/diff/{os.path.basename(new_pdf_key).replace('.pdf', '')}_diff.png"
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=diff_key,
            Body=diff_png_bytes,
            ContentType='image/png'
        )
        
        # 処理結果を返す
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
            "body": json.dumps({
                "message": "Diff generated",
                "diffKey": diff_key,
                "diffPercentage": diff_percentage,
                "newPdfKey": new_pdf_key,
                "oldPdfKey": old_pdf_key
            }),
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
            "body": json.dumps({"message": "Internal Server Error", "error": str(e)}),
        }