import urllib.request
import zipfile
import io
import os
import shutil

url = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip"
dest_dir = r"e:\Smart Waste Management System For Metropolitan Cities\node_portable"

print(f"Downloading Node.js portable from {url}...")
try:
    # Set User-Agent to avoid potential block
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req) as response:
        zip_data = response.read()
    print("Download completed! Extracting archive...")
    
    with zipfile.ZipFile(io.BytesIO(zip_data)) as zip_ref:
        zip_ref.extractall(dest_dir)
    
    print("Extraction completed! Rearranging directory structure...")
    # Find the extracted subfolder (e.g. node-v20.11.0-win-x64) and move its contents to node_portable root
    extracted_folder = os.path.join(dest_dir, "node-v20.11.0-win-x64")
    if os.path.exists(extracted_folder):
        for item in os.listdir(extracted_folder):
            s = os.path.join(extracted_folder, item)
            d = os.path.join(dest_dir, item)
            if os.path.isdir(s):
                shutil.move(s, d)
            else:
                shutil.copy2(s, d)
        shutil.rmtree(extracted_folder)
        
    print("Node.js portable setup successfully in:", dest_dir)
    
    # Test execution path check
    node_path = os.path.join(dest_dir, "node.exe")
    if os.path.exists(node_path):
        print(f"Verified: node.exe exists at {node_path}")
    else:
        print("Warning: node.exe not found in destination directory.")
except Exception as e:
    print(f"Error downloading or extracting Node.js: {e}")
