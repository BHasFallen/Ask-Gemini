import os
import requests
import argparse
from datetime import datetime, timedelta
from requests.auth import HTTPBasicAuth

def load_env(env_path):
    """Simple .env loader to avoid dependencies"""
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value
    return env_vars

def export_amplitude(start, end, api_key, secret_key, output_dir):
    url = "https://amplitude.com/api/2/export"
    params = {
        'start': start,
        'end': end
    }
    
    print(f"Requesting export from {start} to {end}...")
    
    response = requests.get(
        url, 
        params=params, 
        auth=HTTPBasicAuth(api_key, secret_key),
        stream=True
    )
    
    if response.status_code == 200:
        # Check if it's a zip file or gzipped JSON
        content_disposition = response.headers.get('Content-Disposition', '')
        filename = f"amplitude_export_{start}_{end}.zip"
        if 'filename=' in content_disposition:
            filename = content_disposition.split('filename=')[1].strip('"')
        
        filepath = os.path.join(output_dir, filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"Success! Data saved to: {filepath}")
        return filepath
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

if __name__ == "__main__":
    # 1. Load config
    env = load_env(os.path.join(os.path.dirname(__file__), '.env'))
    
    # 2. Parse args
    parser = argparse.ArgumentParser(description="Export raw events from Amplitude")
    parser.add_argument("--start", help="Start time (YYYYMMDDTHH)")
    parser.add_argument("--end", help="End time (YYYYMMDDTHH)")
    parser.add_argument("--key", default=env.get('AMPLITUDE_API_KEY'), help="Amplitude API Key")
    parser.add_argument("--secret", default=env.get('AMPLITUDE_SECRET_KEY'), help="Amplitude Secret Key")
    parser.add_argument("--out", default="exports", help="Output directory")
    
    args = parser.parse_args()
    
    if not args.key or not args.secret:
        print("Error: API Key and Secret Key are required (use .env or --key/--secret)")
        exit(1)
        
    # 3. Handle defaults for time range (last 2 hours)
    if not args.start or not args.end:
        now = datetime.utcnow()
        if not args.end:
            args.end = now.strftime("%Y%m%dT%H")
        if not args.start:
            args.start = (now - timedelta(hours=2)).strftime("%Y%m%dT%H")
            
    # 4. Ensure output dir exists
    if not os.path.exists(args.out):
        os.makedirs(args.out)
        
    export_amplitude(args.start, args.end, args.key, args.secret, args.out)
