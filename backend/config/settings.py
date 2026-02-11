"""Django settings for the DoD compliance backend."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path, locked_keys: set[str]) -> None:
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export ") :].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in locked_keys:
            continue

        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]

        os.environ[key] = value


def _load_local_env() -> None:
    # Keep explicit shell exports authoritative.
    locked_keys = set(os.environ.keys())

    # Within files, allow backend/.env to override repo-root .env.
    for env_path in [BASE_DIR.parent / ".env", BASE_DIR / ".env"]:
        _load_env_file(env_path, locked_keys)


_load_local_env()


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-dev-only-key")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", ["localhost", "127.0.0.1", "backend"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "health",
    "compliance",
    "jira_sync",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "config.observability.RequestIdMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "db")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
USE_SQLITE = env_bool("USE_SQLITE", True)

if not USE_SQLITE and POSTGRES_DB and POSTGRES_USER and POSTGRES_PASSWORD:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": POSTGRES_DB,
            "USER": POSTGRES_USER,
            "PASSWORD": POSTGRES_PASSWORD,
            "HOST": POSTGRES_HOST,
            "PORT": POSTGRES_PORT,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", ["http://localhost:5173"])
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", ["http://localhost:5173"])

ENABLE_HTTPS = env_bool("ENABLE_HTTPS", False)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if ENABLE_HTTPS else None
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", ENABLE_HTTPS)
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", ENABLE_HTTPS)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", ENABLE_HTTPS)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if ENABLE_HTTPS else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", ENABLE_HTTPS)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "same-origin")

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", False)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "dod-dashboard@localhost")
NUDGE_COOLDOWN_HOURS = int(os.getenv("NUDGE_COOLDOWN_HOURS", "24"))
ENABLE_ROLE_AUTH = env_bool("ENABLE_ROLE_AUTH", False)
ENABLE_LDAP_AUTH = env_bool("ENABLE_LDAP_AUTH", False)

AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
if ENABLE_LDAP_AUTH:
    try:
        import ldap  # type: ignore
        from django_auth_ldap.config import GroupOfNamesType, LDAPSearch
    except ImportError as exc:
        raise ImproperlyConfigured(
            "ENABLE_LDAP_AUTH=1 requires django-auth-ldap and python-ldap packages."
        ) from exc

    LDAP_SERVER_URI = os.getenv("LDAP_SERVER_URI", "").strip()
    LDAP_BIND_DN = os.getenv("LDAP_BIND_DN", "").strip()
    LDAP_BIND_PASSWORD = os.getenv("LDAP_BIND_PASSWORD", "").strip()
    LDAP_USER_BASE_DN = os.getenv("LDAP_USER_BASE_DN", "").strip()
    LDAP_GROUP_BASE_DN = os.getenv("LDAP_GROUP_BASE_DN", "").strip()
    LDAP_USER_FILTER = os.getenv("LDAP_USER_FILTER", "(uid=%(user)s)").strip()
    LDAP_REQUIRE_GROUP = os.getenv("LDAP_REQUIRE_GROUP", "").strip()

    missing = [
        name
        for name, value in [
            ("LDAP_SERVER_URI", LDAP_SERVER_URI),
            ("LDAP_BIND_DN", LDAP_BIND_DN),
            ("LDAP_BIND_PASSWORD", LDAP_BIND_PASSWORD),
            ("LDAP_USER_BASE_DN", LDAP_USER_BASE_DN),
            ("LDAP_GROUP_BASE_DN", LDAP_GROUP_BASE_DN),
        ]
        if not value
    ]
    if missing:
        raise ImproperlyConfigured(
            f"ENABLE_LDAP_AUTH=1 but required LDAP settings are missing: {', '.join(missing)}"
        )

    AUTH_LDAP_SERVER_URI = LDAP_SERVER_URI
    AUTH_LDAP_BIND_DN = LDAP_BIND_DN
    AUTH_LDAP_BIND_PASSWORD = LDAP_BIND_PASSWORD
    AUTH_LDAP_USER_SEARCH = LDAPSearch(
        LDAP_USER_BASE_DN,
        ldap.SCOPE_SUBTREE,
        LDAP_USER_FILTER,
    )
    AUTH_LDAP_GROUP_SEARCH = LDAPSearch(
        LDAP_GROUP_BASE_DN,
        ldap.SCOPE_SUBTREE,
        "(objectClass=groupOfNames)",
    )
    AUTH_LDAP_GROUP_TYPE = GroupOfNamesType()
    AUTH_LDAP_MIRROR_GROUPS = True
    AUTH_LDAP_FIND_GROUP_PERMS = False
    if LDAP_REQUIRE_GROUP:
        AUTH_LDAP_REQUIRE_GROUP = LDAP_REQUIRE_GROUP

    AUTHENTICATION_BACKENDS = [
        "django_auth_ldap.backend.LDAPBackend",
        "django.contrib.auth.backends.ModelBackend",
    ]

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)

SYNC_INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "15"))
SYNC_STALE_THRESHOLD_MINUTES = int(os.getenv("SYNC_STALE_THRESHOLD_MINUTES", "30"))
DEFAULT_SYNC_PROJECT_KEY = os.getenv("DEFAULT_SYNC_PROJECT_KEY", "CS0100").strip()
ENABLE_PERIODIC_SYNC = env_bool("ENABLE_PERIODIC_SYNC", True)
if ENABLE_PERIODIC_SYNC:
    CELERY_BEAT_SCHEDULE = {
        "jira-sync-every-15-minutes": {
            "task": "jira_sync.tasks.run_scheduled_jira_sync",
            "schedule": max(SYNC_INTERVAL_MINUTES, 1) * 60,
        }
    }
else:
    CELERY_BEAT_SCHEDULE = {}

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
}
