from django.test import SimpleTestCase


class HealthEndpointTests(SimpleTestCase):
    def test_health_endpoint_returns_service_status(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["service"], "backend")
        self.assertIn("timestamp", response.json())

    def test_health_endpoint_sets_request_id_header(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertIn("X-Request-ID", response.headers)
        self.assertTrue(response.headers["X-Request-ID"])

    def test_health_endpoint_reuses_incoming_request_id_header(self):
        response = self.client.get("/api/health", HTTP_X_REQUEST_ID="req-12345")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "req-12345")
