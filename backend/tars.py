import tensorflow as tf
from keras.preprocessing.text import Tokenizer
from keras.preprocessing.sequence import pad_sequences
import numpy as np
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from fastapi import FastAPI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

questions = [
    "How can I get started with Docker?",
    "How can I learn Docker?",
    "How do I install Docker on Linux?",
    "Explain the concept of an image in Docker.",
    "What is the difference between a container and a virtual machine in Docker?",
    "What are the steps to install Docker on a Linux system?",
    "How do I delete an image in Docker?",
    "I'm having trouble starting a container in Docker, what could be the reasons?",
    "Explain the difference between a layer and an image in Docker.",
    "How can I view the logs of a container in Docker?",
    "How can I set up a custom network for my Docker containers?",
    "How can I back up volumes in Docker?",
    "How do I update Docker to the latest version?",
    "What is Docker Compose and how do I use it?",
    "Can I run Docker on Windows?",
    "Explain the difference between Docker Swarm and Kubernetes.",
    "How do I share Docker images with others?",
    "What are Docker volumes, and why are they important?",
    "How can I scale my Docker containers horizontally?",
    "What security considerations should I keep in mind when using Docker?",
    "Is it possible to run multiple containers on the same network?",
    "How do I create a Dockerfile for my application?",
    "Can I run Docker containers in the cloud?",
    "What is the purpose of the 'docker-compose.yml' file?",
    "Tell me about Docker and how it works.",
    "What are the fundamentals of Docker?",
    "Explain the basics of Docker to me.",
    "Can you provide an overview of Docker?",
    "How does Docker facilitate containerization?",
    "Elaborate on Docker and its core concepts.",
    "Give me a brief on Docker and its functionalities.",
    "Share insights into Docker and its principles.",
    "What are the key components of Docker?",
    "How does Docker simplify application deployment?",
    "What is the basic command to run a Docker container?",
    "How can I list all running Docker containers?",
    "Explain the difference between 'docker ps' and 'docker ps -a'.",
    "What command can I use to stop a running Docker container?",
    "How do I remove a Docker container?",
    "Can you demonstrate how to build a Docker image using a Dockerfile?",
    "What is the purpose of the 'docker-compose up' command?",
    "How can I see the details of a Docker image?",
    "What command is used to pull a Docker image from Docker Hub?",
    "How do I check the logs of a specific Docker container?",
    "Can you provide an example of using volumes in Docker?",
    "What is the significance of the 'docker network' command?",
    "How can I inspect the configuration of a Docker container?",
    "What is the purpose of the 'docker exec' command?",
    "Explain how to tag a Docker image before pushing it to a registry.",
    "give me an example of a Dockerfile for a simple python app?"
]

answers = [
    "It's great that you want to get into Docker. First, you can install Docker from the official Docker website, taking into account your operating system. Additionally, you can verify the installation with one of the following commands:\n docker --version, docker-compose --version. \n After that, you can grasp essential concepts such as containers, images, and DockerFile. In a practical stage, you can start familiarizing yourself with commands for creating and running containers. \n To make the handling of images easier, you can check Docker Hub to find the image you need or upload your own. \n This would be a brief introduction to Docker and how you can delve into the world of containers. If you have any questions about Docker, Tars is here to help you.",
    "To learn Docker, I would recommend starting with the official Docker documentation, which is quite comprehensive and beginner-friendly. Consistent practice is key, so try creating and running different containers to gain practical experience. You can also join Docker communities, such as forums or groups on social media, to ask questions and learn from other users' experiences. Practice and community are essential for effective learning of Docker! \n\n Also, remember that I'm here to help you with anything you need to learn Docker.",
    "To install Docker on Linux, the general steps are as follows:\n 1. Update the package index: sudo apt-get update\n 2. Install necessary packages to allow apt to use a repository over HTTPS: sudo apt-get install apt-transport-https ca-certificates curl software-properties-common\n 3. Add the GPG key for the official Docker repository: curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg\n 4. Configure the stable Docker repository: echo \"deb [signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null\n 5. Install Docker: sudo apt-get update && sudo apt-get install docker-ce docker-ce-cli containerd.io\n 6. Verify the installation: sudo docker run hello-world\n\n Remember to check the official Docker documentation for specific instructions based on your Linux distribution.",
    "The concept of an image in Docker is fundamental. An image is a lightweight, executable package that includes everything needed to run a piece of software, including code, runtime, libraries, environment variables, and configuration files. Images are the foundation of Docker containers and are used to create running instances of applications. You can think of an image as a set of instructions to create a container. Images are stored in registries, such as Docker Hub, and are shared among developers and systems.",
    "The main difference between a container and a virtual machine in Docker lies in operating system-level virtualization. While virtual machines emulate a complete operating system and run on a hypervisor, containers share the kernel of the host operating system and run in an isolated space. Containers are lighter, start faster, and efficiently share resources compared to virtual machines. Additionally, Docker leverages the features of the host operating system kernel for greater efficiency.",
    "The general steps to install Docker on a Linux system are as follows:\n 1. Update the package index: sudo apt-get update\n 2. Install necessary packages to allow apt to use a repository over HTTPS: sudo apt-get install apt-transport-https ca-certificates curl software-properties-common\n 3. Add the GPG key for the official Docker repository: curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg\n 4. Configure the stable Docker repository: echo \"deb [signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null\n 5. Install Docker: sudo apt-get update && sudo apt-get install docker-ce docker-ce-cli containerd.io\n 6. Verify the installation: sudo docker run hello-world\n\n Remember to check the official Docker documentation for specific instructions based on your Linux distribution.",
    "To delete an image in Docker, you can use the docker rmi command. First, get the ID of the image you want to delete using docker images. Then, execute the following command to delete the image:\n\n\ndocker rmi <Image ID>\n\n\nNote that you cannot delete an image if there are running containers based on that image. In that case, you must first stop and remove the associated containers.",
    "If you're having trouble starting a container in Docker, there could be several possible causes. Some suggestions for diagnosing and troubleshooting issues include:\n 1. Check for errors in the output of the docker run command.\n 2. Review the container logs with the docker logs <Container ID> command.\n 3. Verify that the image you are using exists and is available locally or in the specified registry.\n 4. Ensure there are no port conflicts if you are mapping ports from the container to the host.\n 5. Check the container configuration, such as environment variables and network options.\n Remember that the official Docker documentation and the community are valuable resources for resolving specific issues.",
    "In Docker, a layer and an image are related but different concepts. A Docker image is composed of multiple layers. Each layer represents a set of changes to the file system. Layers are stored and reused efficiently, allowing sharing of layers among different images. When you build a new image from a Dockerfile, each instruction adds a new layer to the image. This facilitates the efficient reuse and distribution of images in Docker, as only the layers that change need to be transferred.",
    "To view the logs of a container in Docker, you can use the docker logs command. Simply provide the ID or name of the container you want to inspect. For example:\n\n\ndocker logs <Container ID or name>\n\n\nThis command will show you the container's log output, which can be useful for diagnosing issues, monitoring performance, or understanding container activity.",
    "To set up a custom network for your Docker containers, you can use the docker network command. First, create a new network with the following command:\n\n\ndocker network create <network-name>\n\n\nThen, when running your containers, specify the network with the --network <network-name> parameter. This way, containers can communicate with each other through this custom network. You can also assign aliases to containers to facilitate communication. Remember to check the official Docker documentation for more details and advanced options.",
    "To back up volumes in Docker, you can use various strategies. One option is to use the docker cp command to copy files to or from a container. Another option is to use Docker volumes and perform periodic backups of the data stored in those volumes. You can use external backup tools or custom scripts to automate this process. Make sure to understand the nature of your data and choose the backup strategy that best suits your needs. Additionally, the Docker documentation provides detailed information on volume management and how to back up data in containers.",
    "To update Docker to the latest version, you can use the package manager for your operating system. For example, on Linux, you can use the following commands:\n 1. Update the package index: sudo apt-get update\n 2. Upgrade Docker: sudo apt-get upgrade docker-ce docker-ce-cli containerd.io\n\nMake sure to consult the official Docker documentation for platform-specific instructions.",
    "Docker Compose is a tool for defining and running multi-container Docker applications. It allows you to define a multi-container environment in a single file (docker-compose.yml) and then use a single command to start all the services defined in that file. With Docker Compose, you can easily manage complex applications with multiple interconnected containers.",
    "Yes, Docker can be run on Windows. Docker provides Docker Desktop for Windows, which includes the Docker Engine, Docker CLI, and Docker Compose. You can install Docker Desktop on Windows 10 or Windows Server. Make sure to check the system requirements and installation instructions on the official Docker website.",
    "Docker Swarm and Kubernetes are both container orchestration platforms, but they have some differences. Docker Swarm is Docker's native orchestration tool, designed to be simple and easy to use. Kubernetes, on the other hand, is a more feature-rich and complex orchestration system with a larger ecosystem. Kubernetes is often preferred for large-scale and complex deployments, while Docker Swarm is a good choice for simpler setups or users already familiar with Docker.",
    "To share Docker images with others, you can push your images to a container registry such as Docker Hub. First, tag your image with your Docker Hub username and repository name, then use the docker push command to upload it. Others can then pull your image from the registry using the docker pull command.",
    "Docker volumes are used to persist data generated by and used by Docker containers. They allow data to be stored outside the container, making it more durable and easier to manage. Volumes are crucial for preserving data between container restarts or updates. Docker volumes can be shared among multiple containers and can be managed using Docker commands or Docker Compose.",
    "Scaling Docker containers horizontally involves running multiple instances of a container to distribute the load. Docker provides orchestration tools like Docker Swarm or Kubernetes to automate the scaling process. You can increase the number of container replicas to handle increased demand and improve fault tolerance.",
    "When using Docker, it's essential to consider security. Some best practices include limiting container privileges, regularly updating Docker and its dependencies, scanning images for vulnerabilities, using secure communication channels, and monitoring container activities for unusual behavior. Always follow security guidelines provided by Docker and keep your system and containers updated with the latest security patches.",
    "Yes, you can run multiple containers on the same network. Docker networks provide isolation between containers, allowing them to communicate with each other using their container names or IP addresses. This enables the creation of multi-container applications that work together on the same network.",
    "To create a Dockerfile for your application, you need to define the steps to build an image. Specify the base image, copy application code, install dependencies, expose ports, and define the command to run your application. Dockerfiles provide a reproducible way to build your application environment, making it easy to share with others.",
    "Yes, you can run Docker containers in the cloud. Many cloud providers, such as AWS, Azure, and Google Cloud, offer container orchestration services like Amazon ECS, Azure Kubernetes Service (AKS), and Google Kubernetes Engine (GKE). These services simplify the deployment and management of Docker containers in a cloud environment.",
    "The 'docker-compose.yml' file is used with Docker Compose to define a multi-container Docker application. It includes configuration details for services, networks, and volumes required for your application. By defining the application stack in a single file, you can easily manage and deploy the entire environment with a single command.",
    "Docker is a platform for developing, shipping, and running applications in containers. It uses containerization technology to package an application and its dependencies into a standardized unit called a container. Containers provide consistency across various environments, making it easy to develop and deploy applications in a reproducible way. Docker uses images, containers, and Dockerfiles to streamline the application lifecycle.",
    "At its core, Docker is a containerization platform that allows you to package applications and their dependencies into lightweight, portable containers. These containers can run on any machine that has Docker installed, providing a consistent environment from development to production. Docker simplifies the deployment process, enhances scalability, and promotes collaboration among development and operations teams.",
    "Docker is a powerful platform for containerization. It enables developers to package applications and dependencies into containers, ensuring consistency and portability. Containers are isolated and share the host OS kernel, making them lightweight and efficient. Docker uses images as a blueprint for containers, and Dockerfiles specify the steps to create these images. With Docker, you can streamline the development and deployment of applications.",
    "Docker is a containerization platform that streamlines the development, deployment, and scaling of applications. It allows you to package an application and its dependencies into a container, ensuring consistency across different environments. Docker simplifies the deployment process by providing a standardized unit that can run on any system with Docker installed. This makes it easier to manage dependencies, collaborate on projects, and scale applications as needed.",
    "Docker facilitates containerization by providing a platform to develop, ship, and run applications in containers. Containers encapsulate applications and their dependencies, ensuring consistency and portability. Docker uses images to define the application's environment and dependencies, while containers are instances of these images. This approach simplifies the deployment process, enhances resource efficiency, and accelerates the development lifecycle.",
    "Docker is a containerization technology that enables the packaging and deployment of applications in containers. Containers provide a lightweight, portable, and consistent environment for applications to run. Docker uses images as a blueprint for containers, and Dockerfiles define the steps to create these images. The platform enhances collaboration between development and operations teams by providing a standardized environment throughout the application lifecycle.",
    "Docker is a containerization platform that revolutionizes the way applications are developed, shipped, and deployed. It allows developers to package applications and their dependencies into containers, providing a consistent and reproducible environment. Docker simplifies the deployment process, improves scalability, and accelerates the development cycle. By using images, containers, and Dockerfiles, developers can easily manage and share their applications.",
    "Docker is a powerful tool for containerization, streamlining the process of packaging and deploying applications. It uses container technology to encapsulate applications and their dependencies, ensuring consistent and reliable performance across different environments. Docker employs images to define application environments and Dockerfiles to specify the steps for creating these images. This approach simplifies development workflows and promotes collaboration between teams.",
    "The key components of Docker include images, containers, and Dockerfiles. Images serve as a snapshot of an application and its dependencies, while containers are runtime instances of these images. Dockerfiles are configuration files that define the steps to build images. Docker Hub is a registry for sharing and storing Docker images. Together, these components enable developers to create, share, and run applications consistently across different environments.",
    "Docker simplifies application deployment by utilizing containerization technology. It allows developers to encapsulate applications and dependencies into containers, providing a lightweight and consistent runtime environment. With Docker, applications can be easily moved between development, testing, and production environments. This portability enhances collaboration, accelerates the release cycle, and ensures that applications run reliably across various platforms.",
    "The basic command to run a Docker container is 'docker run'. For example:\n\n\ndocker run image_name\n",
    "To list all running Docker containers, you can use the command 'docker ps'.",
    "The 'docker ps' command shows only running containers, while 'docker ps -a' shows all containers, including those that have stopped.",
    "To stop a running Docker container, you can use the 'docker stop' command followed by the container ID or name. For example:\n\n\ndocker stop container_id\n",
    "To remove a Docker container, you can use the 'docker rm' command followed by the container ID or name. For example:\n\n\ndocker rm container_id\n",
    "To build a Docker image using a Dockerfile, you can use the 'docker build' command. For example:\n\n\ndocker build -t image_name:tag .\n",
    "The 'docker-compose up' command is used to start and initialize services defined in a Docker Compose file.",
    "To see the details of a Docker image, you can use the 'docker image inspect' command followed by the image name. For example:\n\n\ndocker image inspect image_name\n",
    "To pull a Docker image from Docker Hub, you can use the 'docker pull' command. For example:\n\n\ndocker pull image_name\n",
    "To check the logs of a specific Docker container, you can use the 'docker logs' command followed by the container ID or name. For example:\n\n\ndocker logs container_id\n",
    "An example of using volumes in Docker is running a MySQL container with a mounted volume for persistent data storage. For example:\n\n\ndocker run -v /path/on/host:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=password -d mysql:latest\n",
    "The 'docker network' command is used to create and manage Docker networks, enabling communication between containers on the same network.",
    "To inspect the configuration of a Docker container, you can use the 'docker inspect' command followed by the container ID or name. For example:\n\n\ndocker inspect container_id\n",
    "The 'docker exec' command is used to execute a command inside a running Docker container. For example:\n\n\ndocker exec -it container_id /bin/bash\n",
    "To tag a Docker image before pushing it to a registry, you can use the 'docker tag' command. For example:\n\n\ndocker tag image_id username/repository:tag\n",
    '''
      # Use an official Python runtime as a parent image
      FROM python:3.8-slim

      # Set the working directory to /app
      WORKDIR /app

      # Copy the current directory contents into the container at /app
      COPY . /app

      # Install any needed packages specified in requirements.txt
      RUN pip install --no-cache-dir -r requirements.txt

      # Make port 5000 available to the world outside this container
      EXPOSE 5000

      # Define environment variable
      ENV CHATBOT_NAME MyChatBot

      # Run the chatbot application when the container launches
      CMD ["python", "chatbot.py"]
      '''
]


tokenizer = Tokenizer()
tokenizer.fit_on_texts(questions)
total_palabras = len(tokenizer.word_index) + 1

max_len = 10
secuencias_preguntas = tokenizer.texts_to_sequences(questions)
secuencias_preguntas = pad_sequences(secuencias_preguntas, maxlen=max_len)

modelo = tf.keras.Sequential([
    tf.keras.layers.Embedding(total_palabras, 10, input_length=max_len),
    tf.keras.layers.LSTM(100),
    tf.keras.layers.Dense(50, activation='relu'),
    tf.keras.layers.Dense(len(answers), activation='softmax')
])

modelo.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

modelo.fit(secuencias_preguntas, np.array(range(len(answers))), epochs=200, verbose=1)

@app.get("/ask")
async def ask_endpoint(question: str):
    nueva_secuencia = tokenizer.texts_to_sequences([question])
    nueva_secuencia = pad_sequences(nueva_secuencia, maxlen=max_len)

    prediccion = modelo.predict(nueva_secuencia)
    respuesta_predicha = answers[np.argmax(prediccion)]
    
    return {"answer": respuesta_predicha}