from setuptools import setup, find_packages
from pathlib import Path

setup(
    name="kubiq-apm",
    version="1.0.1",
    description="Python auto-instrumentation wrapper for kubiq via a local OpenTelemetry Collector",
    long_description=Path(__file__).with_name("README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    author="Priyanshu Modi",
    packages=find_packages(),
    install_requires=[
        "opentelemetry-distro>=0.40b0",
        "opentelemetry-exporter-otlp>=1.20.0"
    ],
    entry_points={
        "console_scripts": [
            "kubiq-apm=kubiq_apm.__main__:main",
        ]
    },
)
