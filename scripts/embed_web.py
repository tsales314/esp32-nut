import os
import glob
import gzip
import subprocess
import sys

def run_inline_script():
    # Run inline scripts first
    subprocess.run([sys.executable, "scripts/inline_web.py"], check=True)
    subprocess.run([sys.executable, "scripts/inline_update.py"], check=True)

def embed_files():
    data_dir = "data/www"
    out_file = "include/network/web_assets.h"
    
    if not os.path.exists(data_dir):
        print(f"Directory {data_dir} not found. Skipping web embed.")
        return

    # Ensure output directory exists
    os.makedirs(os.path.dirname(out_file), exist_ok=True)

    import hashlib
    
    # We only want to embed these specific files
    target_files = [
        "index_inlined.html",
        "update_inlined.html",
        "login_inlined.html"
    ]
    
    files = [os.path.join(data_dir, f) for f in target_files if os.path.exists(os.path.join(data_dir, f))]
    files.sort()
    
    hasher = hashlib.md5()
    for filepath in files:
        with open(filepath, "rb") as bf:
            content = bf.read()
            content = content.replace(b'\r', b'')
            hasher.update(content)
            
    current_hash = hasher.hexdigest()
    hash_file = "include/network/.web_assets.hash"
    
    if os.path.exists(hash_file) and os.path.exists(out_file):
        with open(hash_file, "r") as hf:
            if hf.read().strip() == current_hash:
                print("Web assets unchanged. Skipping generation.")
                return

    with open(out_file, "w") as f:
        f.write("#ifndef WEB_ASSETS_H\n")
        f.write("#define WEB_ASSETS_H\n\n")
        f.write("#include <Arduino.h>\n\n")
        
        for filepath in files:
            with open(filepath, "rb") as bf:
                content = bf.read()
                content = content.replace(b'\r', b'')
                
            compressed = bytearray(gzip.compress(content, mtime=0))
            if len(compressed) >= 10:
                compressed[9] = 255
            
            rel_path = os.path.relpath(filepath, data_dir).replace("\\", "/")
            var_name = "web_asset_" + rel_path.replace("/", "_").replace(".", "_").replace("-", "_")
            
            f.write(f"const uint8_t {var_name}[] PROGMEM = {{\n")
            for i in range(0, len(compressed), 16):
                chunk = compressed[i:i+16]
                f.write("    " + ", ".join(f"0x{b:02x}" for b in chunk) + ",\n")
            f.write("};\n")
            f.write(f"const size_t {var_name}_len = {len(compressed)};\n\n")

        f.write("#endif // WEB_ASSETS_H\n")
        
    with open(hash_file, "w") as hf:
        hf.write(current_hash)

def generate_web_assets():
    """Regenerate inline pages before writing the firmware's compressed assets."""
    run_inline_script()
    embed_files()


# Standalone: python scripts/embed_web.py
# PlatformIO: pre:scripts/embed_web.py runs as an SCons extra script, not as
# __main__. The old guard silently skipped regeneration during PIO builds,
# leaving firmware with stale checked-in index_inlined.html.
if __name__ == "__main__":
    generate_web_assets()
elif "Import" in globals():
    Import("env")
    if not env.IsIntegrationDump():
        generate_web_assets()
