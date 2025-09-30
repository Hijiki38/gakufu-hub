FROM public.ecr.aws/lambda/python:3.11
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"
COPY app.py ${LAMBDA_TASK_ROOT}
# Lambda は CMD に "module.function" を指定
CMD ["app.handler"]
