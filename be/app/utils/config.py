import os
from dotenv import load_dotenv

# Load env file in the backend root directory (be/.env)
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
load_dotenv(dotenv_path)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
CHROMA_PATH = "./chroma_db"
