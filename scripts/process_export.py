import os
import zipfile
import gzip
import json
import tempfile
import shutil

def process_export(zip_path, output_json):
    combined_data = []
    
    # Create a temporary directory to extract files
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"Extracting {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(tmpdir)
        
        # Walk through extracted files
        print("Processing JSON files...")
        for root, dirs, files in os.walk(tmpdir):
            for file in files:
                if file.endswith('.json.gz'):
                    file_path = os.path.join(root, file)
                    try:
                        with gzip.open(file_path, 'rt', encoding='utf-8') as f:
                            for line in f:
                                if line.strip():
                                    combined_data.append(json.loads(line))
                    except Exception as e:
                        print(f"Error processing {file}: {e}")
        
    # Write combined data to a single JSON file
    print(f"Writing {len(combined_data)} events to {output_json}...")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(combined_data, f, indent=2)
    
    print("Done!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Combine Amplitude export files into a single JSON")
    parser.add_argument("zip_file", help="Path to the exported .zip file")
    parser.add_argument("--out", default="exports/combined_events.json", help="Output JSON file path")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.zip_file):
        print(f"Error: File {args.zip_file} not found.")
        exit(1)
        
    process_export(args.zip_file, args.out)
