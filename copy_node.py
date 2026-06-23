import shutil
import os

src = r"C:\Program Files\nodejs\node.exe"
dst = r"e:\Smart Waste Management System For Metropolitan Cities\server\node.exe"

print(f"Copying {src} to {dst}...")
try:
    shutil.copy2(src, dst)
    print("Node.exe successfully copied to local server directory!")
except Exception as e:
    print(f"Error copying file: {e}")
