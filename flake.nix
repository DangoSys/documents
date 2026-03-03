{
  description = "Buckyball Documents - Online document management system";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        python = pkgs.python312;
        pythonPkgs = python.withPackages (ps: with ps; [
          fastapi
          uvicorn
          httpx
          pyjwt
          cryptography
          pyyaml
          openai
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pythonPkgs
            pkgs.nodejs_20
            pkgs.pnpm
          ];

          shellHook = ''
            echo "Documents dev environment ready"
            echo "  Python:  $(python3 --version)"
            echo "  Node:    $(node --version)"
            echo "  pnpm:    $(pnpm --version)"
            echo ""
            echo "Quick start:"
            echo "  cd frontend && pnpm install && pnpm dev"
            echo "  cd backend && uvicorn backend.main:app --reload"
          '';
        };

        # Production run script
        apps.default = {
          type = "app";
          program = let
            script = pkgs.writeShellScript "run-documents" ''
              set -e
              cd "$(dirname "$0")/.."

              # Check .env
              if [ ! -f .env ]; then
                echo "Error: .env file not found. Copy .env.example to .env and fill in values."
                exit 1
              fi
              set -a; source .env; set +a

              # Build frontend
              if [ ! -d frontend/dist ]; then
                echo "Building frontend..."
                cd frontend && ${pkgs.pnpm}/bin/pnpm install && ${pkgs.pnpm}/bin/pnpm build && cd ..
              fi

              # Start backend (serves frontend static files in production)
              ${pythonPkgs}/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
            '';
          in "${script}";
        };
      }
    );
}
