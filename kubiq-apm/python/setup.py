from setuptools import setup, find_packages

setup(
    name="kubiq-apm",
    version="1.0.0",
    description="Official zero-config APM wrapper for kubiq (Python)",
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
