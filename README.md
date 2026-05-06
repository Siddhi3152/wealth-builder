# 🚀 AI Wealth Builder

An intelligent, full-stack personal finance and wealth management platform built to help users take control of their financial future. The application features an intuitive React Native mobile interface backed by a robust Python/Flask REST API, leveraging data analytics and AI to act as a personalized financial advisor.

## ✨ Comprehensive Feature Set

### 📱 User Experience & Onboarding
- **Seamless Onboarding Flow:** Gathers user demographics (age, profession), financial baselines (income, current savings), and long-term financial goals to personalize the app experience.
- **Intuitive Dashboard:** A central hub displaying a dynamic Financial Health Score, monthly income vs. expense summaries, and at-a-glance goal progress.

### 💸 Financial Tracking & Management
- **Intelligent Expense & Income Tracking:** Add, edit, or delete transactions with native date pickers and clean, swipeable UI gestures.
- **Smart Categorization:** Easily organize spending into predefined categories to visualize cash flow effectively.
- **Automated Daily Reminders:** Native push notifications (fully Android-compatible) scheduled daily to remind users to log their expenses and stay strictly within budget.

### 🎯 Goal Planning & Wealth Building
- **Smart Goals Engine:** Dynamically tracks progress on long-term goals (e.g., buying a house, retirement). Calculates realistic deadlines and statuses (Ahead, On Track, Behind) based on your actual savings rate and historical data.
- **Investment Portfolio Analytics:** Tracks stock and investment performance with visual charts to help users manage asset allocation and understand portfolio growth.

### 🤖 AI-Powered Advisory
- **Interactive AI Chat Assistant:** Powered by Google's Gemini API, users can chat with a virtual advisor that contextualizes its advice based on their unique, real-time financial profile and goals.
- **Advanced Financial Health Scoring:** A sophisticated algorithm that continually scores financial well-being based on savings ratios, discretionary spending, and overall asset diversification.
- **Data Visualization & Reporting:** Beautifully rendered graphs and interactive charts that help users visualize spending trends and wealth accumulation over time.

## 🛠️ Technology Stack

**Frontend (Mobile App)**
- React Native (Expo)
- Axios for API communication
- React Navigation

**Backend (REST API)**
- Python 3.10+
- Flask & Flask-CORS
- SQLite (Database)
- Google Generative AI (Gemini) for AI insights
- APScheduler for background tasks & notifications

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/downloads/) (v3.9+)
- [Expo Go](https://expo.dev/client) app on your mobile device (optional, for physical device testing)

### 1. Backend Setup
Navigate to the backend directory, set up a virtual environment, and install the dependencies:
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Run the Flask server:
```bash
python routes.py
```
*(The backend will start running on `http://127.0.0.1:5000`)*

### 2. Frontend Setup
Open a new terminal window, navigate to the frontend directory, and install dependencies:
```bash
cd frontend
npm install
```

Start the Expo development server:
```bash
npx expo start
```
Press `a` to run on an Android emulator, `i` to run on an iOS simulator, or scan the QR code with the **Expo Go** app to run it on your physical device.
