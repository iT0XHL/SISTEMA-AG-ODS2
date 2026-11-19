"""Administración de cuentas desde la terminal.

    docker compose exec api python -m app.users list
    docker compose exec api python -m app.users add --username ana --name "Ana Quispe"
    docker compose exec api python -m app.users passwd --username ana

Si no se pasa ``--password``, se pide por teclado sin mostrarla.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from app import auth
from app.storage.db import init_db, session_scope
from app.storage.models import AppUser


def _password(args: argparse.Namespace) -> str:
    if args.password:
        return args.password
    first = getpass.getpass("Contraseña: ")
    if first != getpass.getpass("Repita la contraseña: "):
        raise SystemExit("Las contraseñas no coinciden.")
    return first


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="muestra las cuentas existentes")
    add = sub.add_parser("add", help="crea una cuenta")
    add.add_argument("--username", required=True)
    add.add_argument("--name", default="")
    add.add_argument("--password")
    passwd = sub.add_parser("passwd", help="cambia la contraseña de una cuenta")
    passwd.add_argument("--username", required=True)
    passwd.add_argument("--password")
    args = parser.parse_args(argv)

    init_db()
    try:
        with session_scope() as session:
            if args.command == "list":
                for user in session.scalars(select(AppUser).order_by(AppUser.id)):
                    state = "activa" if user.is_active else "inactiva"
                    print(f"{user.username}\t{user.display_name}\t{state}")
            elif args.command == "add":
                user = auth.add_user(session, args.username, args.name, _password(args))
                print(f"Cuenta «{user.username}» creada.")
            else:
                user = auth.set_password(session, args.username, _password(args))
                print(f"Contraseña de «{user.username}» actualizada; se cerraron sus sesiones.")
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
