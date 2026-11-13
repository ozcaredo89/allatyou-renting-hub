# AGENTS.md

Instrucciones obligatorias para cualquier agente IA que trabaje en este repositorio.

## Lectura inicial obligatoria
Antes de modificar cualquier archivo, lee `CLAUDE.md` en la raíz del proyecto.

## Flujo Git y Tickets (Obligatorio — `docs/specs/flujo-git-tickets.md`)
1. **1 Requerimiento = 1 Ticket en GitHub (`#ID`) = 1 Rama dedicada = 1 PR.** Nunca trabajar ni hacer commits directamente en `main`.
2. **Crear el Issue primero** en GitHub (`ozcaredo89/allatyou-renting-hub`) antes de tocar código, con prefijo `[Feat]`, `[Fix]`, `[Chore]` o `[Refactor]`, contexto, criterios de aceptación y especificación técnica.
3. **Crear la rama** con el ID del ticket: `feat/<id>-<slug>`, `fix/<id>-<slug>`, `chore/<id>-<slug>` o `refactor/<id>-<slug>`.
4. **Commits con referencia al ticket**: `feat(#<id>): <descripción>` o `fix(#<id>): <descripción>`.
5. **Validar compilación** antes de abrir/cerrar PR:
   - Backend (raíz): `npm.cmd run build`
   - Frontend (`web/`): `npm.cmd --prefix web run build`
6. **Pull Request y merge inmediato**: Abrir PR usando `.github/pull_request_template.md` (`Closes #<id>`), hacer merge (`gh pr merge --merge --delete-branch`) y volver a `main` actualizado (`git checkout main && git pull`), salvo que el usuario pida dejar el PR abierto.

## Reglas de negocio y contexto técnico
- Consulta el mapa URL → Archivos y las reglas por dominio en `CLAUDE.md` y `docs/specs/`.
- En Windows/PowerShell usa `npm.cmd` en lugar de `npm`.
