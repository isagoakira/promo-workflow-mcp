FROM python:3.11-slim

ARG VECTCUT_REF=main

WORKDIR /opt/vectcut
RUN python -c "from pathlib import Path; from urllib.request import urlretrieve; import tarfile; urlretrieve('https://github.com/sun-guannan/VectCutAPI/archive/refs/heads/${VECTCUT_REF}.tar.gz', '/tmp/vectcut.tar.gz'); tarfile.open('/tmp/vectcut.tar.gz').extractall('/tmp'); source = next(Path('/tmp').glob('VectCutAPI-*')); [target.unlink() for target in Path('.').iterdir()] if any(Path('.').iterdir()) else None; [target.rename(Path('.') / target.name) for target in source.iterdir()]" \
    && pip install --no-cache-dir -r requirements.txt

COPY config.json /opt/vectcut/config.json

EXPOSE 9001

CMD ["python", "capcut_server.py"]
