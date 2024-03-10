# Innoxus

**Overview**

This project provides a streamlined way to orchestrate a collection of APIs built using the Uvicorn ASGI server. A convenient bash script simplifies the management of these APIs.

**Prerequisites**

* macOS operating system
* Bash shell
* Uvicorn installed
* The following API modules installed:
    * **app:**  Provides user authentication (login and registration) functionality  and implements secure routes that require valid JSON Web Tokens (JWTs) for access.
    * **container:** Provides a set of tools to manage and monitor Docker containers through an API.
    * **room:** Provides a basic REST API to manage a collection of "rooms" within a MongoDB database
    * **package:** Establishes an API to manage a collection of software packages and their associated files within a MongoDB database. It utilizes GridFS to optimize the storage and retrieval of these potentially large files.
    * **tars:** Establishes a TensorFlow-based chatbot as an API. The chatbot aims to provide answers specifically related to Docker concepts

**Getting Started**

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/](https://github.com/)<Nexeum>/Innoxus

2. **Navigate to the project directory**:
   ```bash
   cd Innoxus

3. **Grant executable permissions**:
   ```bash
   chmod +x orquestador.sh

4. **Run the script**:
   ```bash
   ./orquestador.sh

Script Explanation

*  The orquestador.sh script is the heart of this project.
* It uses the start_uvicorn function to initialize Uvicorn instances, each in a separate Terminal window.
* The function requires the working directory, app name, and port number to function.
* Configurations for each API are stored in an array.
* The script iterates through the configurations, calling start_uvicorn to launch the APIs.

** Troubleshooting **

If you encounter errors while starting a Uvicorn instance, the script will display an error message and exit. Ensure your API code and its dependencies are correct.