import jwt, datetime
from flask import Flask, jsonify, request
from pymongo import MongoClient
from flask_cors import CORS, cross_origin
import hashlib
from bson.objectid import ObjectId
from bson import json_util

# Instantiation of Flask
app = Flask(__name__)

# Settings CORS (Cross-Origin Resource Sharing)
CORS(app)

# Secret key for JWT
SECRET_KEY = "kubehub"

# Database
client = MongoClient('mongodb://localhost:27017/')
db = client.kubehub

# JWT
def generate_token(user_id):
    try:
        payload = {
            'user_id': user_id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
        return token
    except Exception as e:
        return jsonify({'error': 'Token generation failed', 'message': str(e)}), 500

# Middleware de autenticación
def verify_token(token):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception('Token expired')
    except jwt.InvalidTokenError:
        raise Exception('Invalid token')

# Routes
@app.route('/login', methods=['POST'])
@cross_origin()
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Invalid request', 'message': 'Email and password are required'}), 400

        hashed_password = hashlib.sha1(hashlib.md5(password.encode()).digest()).hexdigest()

        user = db.user.find_one({"email": email, "password": hashed_password})

        if user:
            user_id = str(user['_id'])
            token = generate_token(user_id)
            return jsonify({'message': 'Login successful', 'token': token})
        else:
            return jsonify({'error': 'Invalid credentials', 'message': 'Invalid email or password'}), 401
    except Exception as e:
        return jsonify({'error': 'Login failed', 'message': str(e)}), 500
    
@app.route('/userData', methods=['GET'])
@cross_origin()
def get_user_data():
    try:
        token = request.headers.get('Authorization')

        if token.startswith('Bearer '):
            token = token.split(' ')[1]
            
        try:
            payload = verify_token(token)
            user_id = payload['user_id']
        except Exception as e:
            return jsonify({'error': str(e), 'message': 'Log in again'}), 401

        user = db.user.find_one({"_id": ObjectId(user_id)})

        if user:
            return json_util.dumps({'data': user})
        else:
            return jsonify({'error': 'User not found', 'message': 'User not found'}), 404

    except Exception as e:
        return jsonify({'error': 'User data failed', 'message': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
