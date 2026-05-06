from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from models import db
from routes import api_bp
import os

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    # Configure SQLite database
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///finance.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = 'super-secret-wealth-builder-key' # In production, use an environment variable
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False
    app.config['JWT_VERIFY_EXPIRATION'] = False    
    db.init_app(app)
    jwt = JWTManager(app)
    
    with app.app_context():
        # Clear old database for the structural change
        # db.drop_all() 
        db.create_all()
        
    app.register_blueprint(api_bp)
    
    @app.route('/')
    def index():
        return jsonify({"message": "Finance App Backend is running!"})
        
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5001)
