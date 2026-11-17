# Ver Kairos desde el celular

El servidor y el celular deben poder comunicarse en la misma red local. No hace falta dominio ni
hosting. No abrir puertos del router para esta prueba.

## Descargar y levantar

Una vez publicado el repositorio privado, desde la terminal de la máquina que ejecutará la
aplicación:

```bash
gh repo clone Elias-Lipovetzky/kairos-horas
cd kairos-horas
cp .env.example .env
openssl rand -hex 24
```

Para clonar un repositorio privado, esa máquina debe tener acceso a la cuenta de GitHub: ejecutar
`gh auth login` allí si todavía no está autenticada.

Editar `.env`: reemplazar la contraseña de PostgreSQL por la generada y actualizar también
`DATABASE_URL` con la misma clave. Configurar:

```dotenv
APP_BIND_ADDRESS=0.0.0.0
APP_PORT=8080
APP_URL=http://192.168.1.50:8080
COOKIE_SECURE=false
```

`192.168.1.50` es un ejemplo: reemplazar por la IP real accesible desde el celular según las
secciones siguientes. `APP_URL` sirve para los enlaces de recuperación; las llamadas de la
aplicación usan el mismo origen del navegador, por lo que también funcionan sin correo.

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8080/api/health
```

Crear el administrador siguiendo el README. Si cambiaste `.env` después del inicio, ejecutar
`docker compose up -d` para recrear la configuración afectada.

## Si moviste la carpeta del proyecto

Ejecutar Compose desde la carpeta que contiene `compose.yaml` y el archivo `nginx.conf`. El nombre
de proyecto queda fijado en `herramientas` para conservar el volumen original
`herramientas_postgres_data`, aunque la carpeta ahora se llame Manejo de horas. No cambiar ese
nombre ni usar otro `-p` si se quiere recuperar esa misma base.

Si Docker Desktop informa que no puede montar nginx.conf porque es un directorio, el contenedor está
usando una ruta anterior. Desde PowerShell:

```powershell
cd 'C:\Users\elias\OneDrive\Desktop\Empresa\Herramientas\Manejo de horas'
docker compose up -d --build --force-recreate
```

Recrear los contenedores conserva el volumen. El botón Start de Docker Desktop reutiliza las rutas
del contenedor anterior; se necesita `up` para aplicar la configuración corregida. El montaje de
Nginx rechaza ahora archivos ausentes en lugar de crear una carpeta nginx.conf automáticamente.

Referencias: [nombre del proyecto](https://docs.docker.com/compose/how-tos/project-name/) y
[montajes de servicios](https://docs.docker.com/reference/compose-file/services/#volumes).

## Linux en una máquina virtual o física

Para una máquina virtual tradicional, usar una interfaz de red en modo puente (bridged) que permita
que la VM tenga una IP en la misma red del celular. Una VM configurada solamente con NAT requiere un
reenvío de puertos en el hipervisor.

Consultar la IP en Linux:

```bash
ip -4 addr
```

Elegir la IP de la interfaz de red local, no las de Docker ni `127.0.0.1`. Desde el celular abrir
`http://IP_DEL_LINUX:8080`.

Si Linux tiene firewall activo, permitir TCP 8080 desde la subred local real. Revisar las reglas
efectivas de Docker, porque publicar un puerto puede usar reglas distintas de las del firewall del
host. No se publica PostgreSQL ni el backend directamente.

## Docker Desktop con WSL

Si Docker Desktop publica el puerto en Windows, primero probar en el navegador de Windows
`http://localhost:8080`. Luego ejecutar `ipconfig` en PowerShell y buscar la IPv4 del adaptador
Wi-Fi o Ethernet conectado, por ejemplo `192.168.1.50`.

Desde el celular abrir `http://192.168.1.50:8080`, con la IP real. No usar `localhost` en el
celular: apuntaría al propio teléfono.

Si el acceso local de Windows funciona y el teléfono no llega, revisar que la conexión de Windows
sea una red privada de confianza y que el firewall permita el puerto. Desde PowerShell como
administrador, crear una regla restringida al perfil privado y la subred local:

```powershell
New-NetFirewallRule -Name 'Kairos-LAN-8080' -DisplayName 'Kairos LAN 8080' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private -RemoteAddress LocalSubnet
```

Si esa regla ya existe, revisarla en vez de volver a crearla. No desactivar todo el firewall.

## Docker dentro de WSL con red NAT

Si Docker funciona directamente dentro de WSL y el puerto no está publicado en la interfaz LAN de
Windows, se puede reenviar el puerto. Ejecutar primero desde PowerShell:

```powershell
wsl hostname -I
netsh interface portproxy show v4tov4
```

Tomar la IPv4 de WSL, por ejemplo `172.25.10.20`. Verificar que no haya otro reenvío usando el
puerto 8080. Desde PowerShell como administrador, reemplazar la IP del ejemplo:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8080 connectaddress=172.25.10.20 connectport=8080
```

Agregar la regla de firewall de la sección anterior si todavía no existe. La IP que se abre en el
celular y se configura en `APP_URL` es la IP LAN de Windows, no la IP privada de WSL. La IP de WSL
puede cambiar al reiniciar; si cambia, actualizar este reenvío. No aplicar este reenvío si Docker
Desktop ya está escuchando en ese puerto.

Para retirar únicamente esta configuración cuando no se necesite:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8080
Remove-NetFirewallRule -Name 'Kairos-LAN-8080'
```

## Comprobación

1. En el servidor, `/api/health` devuelve `{"ok":true}`.
2. En Windows, abrir la URL con la IP LAN y el puerto 8080.
3. En el celular, conectado al mismo Wi-Fi, abrir esa misma URL.
4. Iniciar sesión y cargar una persona con varios lugares.
5. Consultar el registro y descargar un PDF o Excel.

Si el celular no conecta pero Windows sí, revisar el firewall, la red de invitados del router, el
aislamiento entre clientes Wi-Fi o una VPN activa. Una red de invitados puede impedir el acceso
entre dispositivos aunque compartan el mismo router.

El acceso móvil por HTTP local está contemplado: la interfaz no exige HTTPS para generar
identificadores de carga. La publicación fuera de la red local y la configuración HTTPS corresponden
a la segunda etapa.
