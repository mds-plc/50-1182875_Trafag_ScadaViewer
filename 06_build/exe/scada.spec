# scada.spec — PyInstaller spec pro ScadaViewer
# Spustit přes build.bat (ne přímo).
import os

block_cipher = None

_project_root  = os.path.abspath(os.path.join(SPECPATH, '../..'))
_src_dir       = os.path.join(_project_root, '00_backend')
_frontend_dist = os.path.join(_project_root, '01_frontend', 'dist')

a = Analysis(
    [os.path.join(_project_root, 'main.py')],
    pathex=[_src_dir],
    binaries=[],
    datas=[
        (_frontend_dist, 'frontend_dist'),  # React build → sys._MEIPASS/frontend_dist/
    ],
    hiddenimports=[
        # uvicorn
        'uvicorn.logging',
        'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan', 'uvicorn.lifespan.on',
        # async + http
        'anyio', 'anyio._backends._asyncio',
        'httptools', 'websockets',
        # deps
        'pyads', 'tomli',
        # scada submoduly
        'scada', 'scada.config', 'scada.constants', 'scada.logging_setup',
        'scada.models', 'scada.app',
        'scada.api', 'scada.api.auth', 'scada.api.config_api', 'scada.api.data',
        'scada.api.files', 'scada.api.health', 'scada.api.orders_ws',
        'scada.api.plc_ws', 'scada.api.status', 'scada.api.wip',
        'scada.services', 'scada.services.ads_monitor',
        'scada.services.csv_reader', 'scada.services.order_watcher',
        'scada.services.ws_manager', 'scada.services.file_service',
        'scada.services.repositories', 'scada.services.repositories.csv_repository',
    ],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'IPython', 'jupyter', 'pytest'],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='scada_viewer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=False,
    name='scada_viewer',
)
