import os
import subprocess
import webbrowser
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer
import signal
import sys
import argparse

# Define directories and file paths
curr_dir = os.path.dirname(os.path.abspath(__file__))
index_file = "test_report_server.html"
index_path = os.path.join(curr_dir, index_file)
port = 4000


def get_network_ip():
    """
    Gets the network IP address of this machine.
    """
    import socket
    try:
        # Create a socket to determine the network IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def start_web_server(directory, port=8000):
    """
    Starts a simple HTTP server to serve files from the specified directory.
    """
    os.chdir(directory)
    handler = SimpleHTTPRequestHandler
    host = get_network_ip()

    while True:
        try:
            with TCPServer(("0.0.0.0", port), handler) as httpd:
                server_address = f"http://{host}:{port}/{index_file}"
                print(f"Server running at {server_address}")
                print("Press Ctrl+C to stop the server")
                webbrowser.open(server_address)

                # Handle SIGINT (Ctrl+C) to stop the server gracefully
                def stop_server(signal_received, frame):
                    print("\nStopping server...")
                    sys.exit(0)

                signal.signal(signal.SIGINT, stop_server)
                httpd.serve_forever()
        except OSError as e:
            if e.errno == 98:  # Address already in use
                print(f"Port {port} is in use. Trying the next port...")
                port += 1
            else:
                raise


def run_backend_tests():
    """
    Runs the Docker command to execute the backend tests.
    """
    docker_command = [
        "docker", "exec", "sorsim-backend", "npm", "run", "test-run"]
    try:
        print("Running backend tests...")
        subprocess.run(docker_command, check=True)
        print("Backend tests completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error running Docker command: {e}")
        sys.exit(1)


def run_frontend_tests():
    try:
        print("Running frontend tests...")
        print("Frontend tests not implemented.")
    except subprocess.CalledProcessError as e:
        print(f"Error running Docker command: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run tests and start a web server for test reports.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 test_report_server.py b    # Run backend tests then start server
  python3 test_report_server.py f    # Run frontend tests then start server
  python3 test_report_server.py a    # Run all tests then start server
  python3 test_report_server.py r    # Just run the server (no tests)
        """
    )
    parser.add_argument(
        "mode",
        nargs="?",
        choices=["b", "f", "a", "r"],
        help="Test mode: 'b' (backend), 'f' (frontend), 'a' (all), 'r' (run server only)"
    )

    args = parser.parse_args()

    # If no argument provided, prompt interactively
    if args.mode is None:
        print("Choose an option:")
        print("b:     Run Backend Tests  + Run Server")
        print("f:     Run Frontend Tests + Run Server")
        print("a:     Run All Tests      + Run Server")
        print("r:     Skip Tests         + Run Server")
        choice = input("Enter your choice: ").strip()
    else:
        choice = args.mode

    if choice == "b":
        run_backend_tests()
    elif choice == "f":
        run_frontend_tests()
    elif choice == "a":
        run_backend_tests()
        run_frontend_tests()
    elif choice == "r":
        print("Skipping tests, running server only...")

    if os.path.exists(index_path):
        print("Starting the web server...")
        start_web_server(curr_dir, port)
    else:
        print(f"Error: {index_path} does not exist.")
        sys.exit(1)
