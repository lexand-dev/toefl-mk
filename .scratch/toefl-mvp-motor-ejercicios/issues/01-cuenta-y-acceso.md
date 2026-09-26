# 01: Cuenta y acceso

**What to build:** Un alumno puede registrarse, verificar su correo, iniciar sesión, recuperar la contraseña y usar sesiones simultáneas en la aplicación desplegable. Un único usuario UUID sustenta tanto Better Auth como el dominio, sin un perfil duplicado.

**Blocked by:** None (can start immediately).

**Status:** completed

- [ ] El registro público crea únicamente el rol `learner`; ningún campo cliente permite elevar permisos.
- [ ] Verificación y recuperación usan correo transaccional; restablecer la contraseña revoca sesiones anteriores.
- [ ] Sesiones renovables de siete días, limitador persistente y permisos `learner`, `editor`, `admin` se comprueban en servidor.
- [ ] Las migraciones ejecutables unifican `users` manteniendo UUID y sin crear perfil paralelo.
- [ ] Flujos y límites de autorización se comprueban desde las rutas públicas.
