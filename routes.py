from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, Transaction, Investment, Goal, User, GoalSavings
import os
os.environ["YFINANCE_NO_EXCEPTION_ON_HTTP_ERROR"] = "1"
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
import math
import time
import requests

import uuid

price_cache = {}
CACHE_DURATION = 300

price_cache = {}
CACHE_DURATION = 300

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/onboard-new-user', methods=['POST'])
def onboard_new_user():
    data = request.json
    name = data.get('name', '')
    age = data.get('age')
    profession = data.get('profession', '')
    income = float(data.get('monthly_income', 0))
    goal = data.get('goal', '')

    # Create anonymous user with a unique device-based identifier
    device_id = data.get('device_id', str(uuid.uuid4()))
    email = f"{device_id}@anonymous.local"

    # Check if this device already has an account
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        access_token = create_access_token(identity=str(existing_user.id))
        return jsonify(access_token=access_token, user_id=existing_user.id, is_onboarded=True), 200

    user = User(
        email=email,
        name=name,
        age=int(age) if age else None,
        profession=profession,
        monthly_income=income,
        is_onboarded=True
    )
    db.session.add(user)
    db.session.commit()

    # If a financial goal was provided, save it
    if goal:
        new_goal = Goal(
            user_id=user.id,
            name=goal,
            target_amount=0.0,
            current_amount=0.0
        )
        db.session.add(new_goal)
        db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, user_id=user.id, is_onboarded=True), 201

@api_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email already registered"}), 400

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, user_id=user.id, is_onboarded=False), 201

@api_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token, user_id=user.id, is_onboarded=user.is_onboarded), 200

    return jsonify({"msg": "Bad email or password"}), 401

@api_bp.route('/set-income', methods=['POST'])
@jwt_required()
def set_income():
    user_id = get_jwt_identity()
    data = request.json
    income = float(data.get('monthly_income', 0))
    
    user = User.query.get(user_id)
    if user:
        user.monthly_income = income
        user.is_onboarded = True
        db.session.commit()
        return jsonify({"message": "Income saved", "monthly_income": income}), 200
    
    return jsonify({"msg": "User not found"}), 404

@api_bp.route('/user/limits', methods=['GET', 'POST'])
@jwt_required()
def manage_limits():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    
    if request.method == 'POST':
        data = request.json
        user.daily_spending_limit = float(data.get('daily_spending_limit', user.daily_spending_limit))
        user.monthly_spending_limit = float(data.get('monthly_spending_limit', user.monthly_spending_limit))
        db.session.commit()
        return jsonify({"message": "Limits updated", "daily_spending_limit": user.daily_spending_limit, "monthly_spending_limit": user.monthly_spending_limit}), 200
        
    return jsonify({
        "daily_spending_limit": user.daily_spending_limit,
        "monthly_spending_limit": user.monthly_spending_limit
    }), 200

@api_bp.route('/user/settings', methods=['GET', 'POST'])
@jwt_required()
def user_settings():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    if request.method == 'POST':
        data = request.json
        user.reminder_time = data.get('reminder_time', user.reminder_time)
        user.reminder_enabled = data.get('reminder_enabled', user.reminder_enabled)
        db.session.commit()
        return jsonify({"message": "Settings updated", "reminder_time": user.reminder_time, "reminder_enabled": user.reminder_enabled}), 200
        
    return jsonify({
        "reminder_time": user.reminder_time,
        "reminder_enabled": user.reminder_enabled,
        "name": user.name,
        "monthly_income": user.monthly_income
    }), 200

def check_spending_limits(user_id):
    user = User.query.get(user_id)
    if not user:
        return []
    
    now = datetime.utcnow()
    # Total Today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_txs = Transaction.query.filter_by(user_id=user_id).filter(
        Transaction.date >= today_start,
        Transaction.type.in_(['expense', 'debit'])
    ).all()
    total_today = sum(tx.amount for tx in today_txs)
    
    # Total This Month
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_txs = Transaction.query.filter_by(user_id=user_id).filter(
        Transaction.date >= month_start,
        Transaction.type.in_(['expense', 'debit'])
    ).all()
    total_month = sum(tx.amount for tx in month_txs)
    
    warnings = []
    if user.daily_spending_limit > 0 and total_today > user.daily_spending_limit:
        warnings.append("You are exceeding your daily budget")
    if user.monthly_spending_limit > 0 and total_month > user.monthly_spending_limit:
        warnings.append("You're moving away from your financial goals")
        
    return warnings

@api_bp.route('/add-transaction', methods=['POST'])
@jwt_required()
def add_transaction():
    user_id = get_jwt_identity()
    data = request.json
    try:
        new_tx = Transaction(
            user_id=user_id,
            amount=float(data.get('amount', 0)),
            merchant=data.get('merchant', 'Unknown'),
            category=data.get('category', 'Uncategorized'),
            type=data.get('type', 'expense'),
            description=data.get('description', '')
        )
        if 'date' in data and data['date']:
            try:
                new_tx.date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
            except ValueError:
                pass
            
        db.session.add(new_tx)
        db.session.commit()
        
        # Check for limit breaches
        warnings = check_spending_limits(user_id)
        
        return jsonify({
            "message": "Transaction added successfully", 
            "id": new_tx.id,
            "warnings": warnings
        }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@api_bp.route('/transactions', methods=['GET'])
@jwt_required()
def get_transactions():
    user_id = get_jwt_identity()
    transactions = Transaction.query.filter_by(user_id=user_id).order_by(Transaction.date.desc()).all()
    res = []
    for tx in transactions:
        res.append({
            "id": tx.id,
            "amount": tx.amount,
            "merchant": tx.merchant,
            "category": tx.category,
            "date": tx.date.isoformat(),
            "type": tx.type,
            "description": tx.description or ''
        })
    return jsonify(res), 200

@api_bp.route('/transactions/<int:tx_id>', methods=['PUT'])
@jwt_required()
def update_transaction(tx_id):
    user_id = get_jwt_identity()
    tx = Transaction.query.filter_by(id=tx_id, user_id=user_id).first()
    if not tx:
        return jsonify({"msg": "Transaction not found"}), 404
    
    data = request.json
    tx.amount = float(data.get('amount', tx.amount))
    tx.merchant = data.get('merchant', tx.merchant)
    tx.category = data.get('category', tx.category)
    if 'date' in data:
        try:
            tx.date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
        except ValueError:
            pass
    
    db.session.commit()
    return jsonify({"message": "Transaction updated"}), 200

@api_bp.route('/transactions/<int:tx_id>', methods=['DELETE'])
@jwt_required()
def delete_transaction(tx_id):
    user_id = get_jwt_identity()
    tx = Transaction.query.filter_by(id=tx_id, user_id=user_id).first()
    if not tx:
        return jsonify({"msg": "Transaction not found"}), 404
    
    db.session.delete(tx)
    db.session.commit()
    return jsonify({"message": "Transaction deleted"}), 200

@api_bp.route('/batch-transactions', methods=['POST'])
@jwt_required()
def batch_add_transactions():
    user_id = get_jwt_identity()
    data = request.json # Expects a list of transaction objects
    if not isinstance(data, list):
        return jsonify({"msg": "Expected list of transactions"}), 400
    
    try:
        for item in data:
            new_tx = Transaction(
                user_id=user_id,
                amount=float(item.get('amount', 0)),
                merchant=item.get('merchant', 'Unknown'),
                category=item.get('category', 'Uncategorized'),
                type=item.get('type', 'expense'),
                description=item.get('description', '')
            )
            if 'date' in item and item['date']:
                try:
                    # Handle multiple formats if needed, butisoformat handles most from JS
                    date_val = item['date']
                    if isinstance(date_val, str):
                        new_tx.date = datetime.fromisoformat(date_val.replace('Z', '+00:00'))
                    else:
                        new_tx.date = datetime.utcnow()
                except (ValueError, TypeError):
                    new_tx.date = datetime.utcnow()
            db.session.add(new_tx)
        
        db.session.commit()
        return jsonify({"message": f"{len(data)} transactions added"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@api_bp.route('/monthly-trends', methods=['GET'])
@jwt_required()
def monthly_trends():
    user_id = get_jwt_identity()
    
    # Always provide labels for the last 6 months starting from today
    today = datetime.utcnow()
    month_starts = pd.date_range(end=today, periods=6, freq='MS')
    # Use month abbreviations as labels
    labels = month_starts.strftime('%b').tolist()
    
    # Get all transactions
    transactions = Transaction.query.filter_by(user_id=user_id).all()
    
    if not transactions:
        return jsonify({"labels": labels, "expense_data": [0]*6, "income_data": [0]*6}), 200
        
    df = pd.DataFrame([{
        'date': tx.date,
        'amount': tx.amount,
        'type': tx.type.lower()
    } for tx in transactions])
    
    # Categorize
    df['category_type'] = df['type'].apply(lambda x: 'income' if x in ['income', 'credit'] else 'expense')
    # Group by month abbreviation for matching
    df['month'] = df['date'].dt.strftime('%b')
    
    # Aggregate sums
    monthly_agg = df.groupby(['month', 'category_type'])['amount'].sum().unstack(fill_value=0)
    
    # Map back to fixed labels
    expense_data = [float(monthly_agg.get('expense', {}).get(m, 0)) for m in labels]
    income_data = [float(monthly_agg.get('income', {}).get(m, 0)) for m in labels]
    
    return jsonify({
        "labels": labels,
        "expense_data": expense_data,
        "income_data": income_data
    }), 200

@api_bp.route('/recent-transactions', methods=['GET'])
@jwt_required()
def recent_transactions():
    user_id = get_jwt_identity()
    transactions = Transaction.query.filter_by(user_id=user_id).order_by(Transaction.date.desc()).limit(5).all()
    res = []
    for tx in transactions:
        is_income = tx.type.lower() in ['income', 'credit']
        res.append({
            "id": tx.id,
            "amount": tx.amount,
            "merchant": tx.merchant,
            "category": tx.category,
            "date": tx.date.isoformat(),
            "type": tx.type.lower(),
            "is_income": is_income,
            "description": tx.description or ''
        })
    return jsonify(res), 200

@api_bp.route('/spending-insights', methods=['GET'])
@jwt_required()
def spending_insights():
    user_id = get_jwt_identity()
    # Support both 'expense' and 'debit' types for breakdown
    transactions = Transaction.query.filter_by(user_id=user_id).filter(
        Transaction.type.in_(['expense', 'debit'])
    ).all()
    
    if not transactions:
        return jsonify({"top_categories": [], "total_spent": 0}), 200
    
    cat_amounts = {}
    total = 0
    for tx in transactions:
        cat = tx.category
        amt = tx.amount
        cat_amounts[cat] = cat_amounts.get(cat, 0) + amt
        total += amt
        
    formatted = [{"category": k, "amount": v} for k, v in cat_amounts.items()]
    formatted.sort(key=lambda x: x["amount"], reverse=True)
    
    return jsonify({
        "total_spent": total,
        "top_categories": formatted[:5]
    }), 200

def _compute_surplus(user_id):
    user = User.query.get(user_id)
    salary = user.monthly_income if user else 0.0
    
    # Sum credit/income transactions
    income_transactions = Transaction.query.filter_by(user_id=user_id).filter(
        Transaction.type.in_(['income', 'credit'])
    ).all()
    total_income = sum(tx.amount for tx in income_transactions)
    
    # Sum debit/expense transactions
    expense_transactions = Transaction.query.filter_by(user_id=user_id).filter(
        Transaction.type.in_(['expense', 'debit'])
    ).all()
    total_expenses = sum(tx.amount for tx in expense_transactions)
    
    surplus = total_income - total_expenses
    return {
        "income": total_income,
        "expenses": total_expenses,
        "surplus": surplus,
        "salary": salary
    }

@api_bp.route('/surplus', methods=['GET'])
@jwt_required()
def get_surplus():
    user_id = get_jwt_identity()
    return jsonify(_compute_surplus(user_id)), 200

@api_bp.route('/user-profile', methods=['GET'])
@jwt_required()
def get_user_profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    return jsonify({
        "name": user.name or '',
        "salary": user.monthly_income or 0.0,
        "age": user.age,
        "profession": user.profession or ''
    }), 200

@api_bp.route('/investment-suggestions', methods=['GET'])
@jwt_required()
def investment_suggestions():
    user_id = get_jwt_identity()
    data = _compute_surplus(user_id)
    surplus = data.get("surplus", 0)
    
    suggestion = "You have no surplus to invest this month. Focus on reducing expenses."
    suggested_amount = 0
    if surplus > 0:
        suggested_amount = surplus * 0.2
        suggestion = f"You can stably invest ₹{suggested_amount:.2f} this month. Consider NIFTY 50 Index funds or Bluechip stocks."
        
    return jsonify({
        "suggestion": suggestion,
        "amount": suggested_amount
    }), 200

@api_bp.route('/add-investment', methods=['POST'])
@jwt_required()
def add_investment():
    user_id = get_jwt_identity()
    data = request.json
    try:
        new_inv = Investment(
            user_id=user_id,
            symbol=data.get('symbol', '').upper(),
            quantity=float(data.get('quantity', 0)),
            purchase_price=float(data.get('purchase_price', 0))
        )
        db.session.add(new_inv)
        db.session.commit()
        return jsonify({"message": "Investment added", "id": new_inv.id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@api_bp.route('/delete-investment/<int:inv_id>', methods=['DELETE'])
@jwt_required()
def delete_investment(inv_id):
    user_id = get_jwt_identity()
    inv = Investment.query.filter_by(id=inv_id, user_id=user_id).first()
    if not inv:
        return jsonify({"msg": "Investment not found"}), 404
        
    db.session.delete(inv)
    db.session.commit()
    return jsonify({"message": "Investment deleted"}), 200

def get_live_price(resolved_symbol):
    if resolved_symbol in price_cache:
        cached_price, cached_time = price_cache[resolved_symbol]
        if time.time() - cached_time < CACHE_DURATION:
            return cached_price
    try:
        ticker = yf.Ticker(resolved_symbol)
        price = None
        try:
            price = ticker.fast_info.last_price
            if not price or price <= 0:
                time.sleep(1)
                ticker = yf.Ticker(resolved_symbol)
                price = ticker.fast_info.last_price
        except Exception as fast_e:
            print(f"fast_info failed for {resolved_symbol}: {fast_e}")

        if price and price > 0 and not math.isnan(float(price)):
            price = round(float(price), 2)
            price_cache[resolved_symbol] = (price, time.time())
            return price
        hist = ticker.history(period="5d", auto_adjust=False)
        if not hist.empty:
            price = round(float(hist["Close"].iloc[-1]), 2)
            price_cache[resolved_symbol] = (price, time.time())
            return price
        return None
    except Exception as e:
        print(f"Price fetch failed for {resolved_symbol}: {e}")
        return None

def _fetch_yf_price_and_currency(symbol):
    search_symbol = str(symbol).strip().upper()
    
    # Handle active structural NSE demergers/renames seamlessly
    SYMBOL_MAP = {
        "TATAMOTORS": "TMPV",  # Transitioned to Tata Motors Passenger Vehicles (TMPV.NS) on April 2026
    }
    search_symbol = SYMBOL_MAP.get(search_symbol, search_symbol)
    
    current_price = None
    price_error = None
    currency = "?"

    US_WHITELIST = {"AAPL", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NVDA"}

    try:
        if '.' not in search_symbol:
            p = get_live_price(search_symbol + ".NS")
            if p is not None:
                current_price = p
                resolved_symbol = search_symbol + ".NS"
            else:
                p = get_live_price(search_symbol + ".BO")
                if p is not None:
                    current_price = p
                    resolved_symbol = search_symbol + ".BO"
                else:
                    if search_symbol in US_WHITELIST:
                        p = get_live_price(search_symbol)
                        if p is not None:
                            current_price = p
                            resolved_symbol = search_symbol
                        else:
                            price_error = "not_found"
                    else:
                        price_error = "not_found"
        else:
            p = get_live_price(search_symbol)
            if p is not None:
                current_price = p
                resolved_symbol = search_symbol
            else:
                price_error = "not_found"
                
        if current_price is not None:
            try:
                t = yf.Ticker(resolved_symbol)
                c = t.info.get("currency")
                if c: currency = c
            except Exception:
                pass
            print(f"Resolved: {resolved_symbol} | Price: {current_price} | Currency: {currency}", flush=True)

    except Exception:
        price_error = "unavailable"
        
    return current_price, price_error, currency

@api_bp.route('/portfolio', methods=['GET'])
@jwt_required()
def get_portfolio():
    user_id = get_jwt_identity()
    investments = Investment.query.filter_by(user_id=user_id).all()
    portfolio = []
    total_invested = 0
    total_current_value = 0
    
    for inv in investments:
        time.sleep(0.3)
        current_price, price_error, currency = _fetch_yf_price_and_currency(inv.symbol)
            
        qty = inv.quantity if inv.quantity is not None else 0
        purchase_price = inv.purchase_price if inv.purchase_price is not None else 0
        invested = round(qty * purchase_price, 2)
        
        breakeven_price = None
        if qty and qty > 0:
            breakeven_price = round(invested / qty, 2)
            
        cp = current_price if current_price is not None else breakeven_price if breakeven_price is not None else 0
            
        current_val = round(qty * cp, 2)
        pl = round(current_val - invested, 2)
        pl_percentage = round((pl / invested * 100), 2) if invested and invested > 0 else None
        
        is_invalid = not qty or qty <= 0 or not invested or invested <= 0 or price_error in ["not_found", "unavailable"]

        if currency == "USD":
            pl = None
            pl_percentage = None
        elif currency == "INR" and not is_invalid and current_price is not None and current_price > 0:
            total_invested += invested
            total_current_value += current_val
        
        if price_error:
            display = None
        elif currency == "USD":
            display = f"USD {current_price:.2f}"
        elif currency == "?":
            display = f"? {current_price:.2f}"
        else:
            display = f"₹{current_price:.2f}"

        portfolio.append({
            "id": inv.id,
            "symbol": inv.symbol,
            "quantity": inv.quantity,
            "purchase_price": inv.purchase_price,
            "total_invested": invested,
            "breakeven_price": breakeven_price,
            "current_price": current_price,
            "current_price_display": display,
            "currency": currency,
            "price_error": price_error,
            "current_value": current_val,
            "profit_loss": pl,
            "pl_percentage": pl_percentage
        })
        
    return jsonify({
        "holdings": portfolio,
        "total_invested": round(total_invested, 2),
        "total_value": round(total_current_value, 2),
        "total_profit_loss": round(total_current_value - total_invested, 2)
    }), 200

@api_bp.route('/add-goal', methods=['POST'])
@jwt_required()
def add_goal():
    user_id = get_jwt_identity()
    data = request.json
    
    duration_months = int(data.get('duration_months', 6))
    target_date = datetime.utcnow() + timedelta(days=30 * duration_months)
    
    new_goal = Goal(
        user_id=user_id,
        name=data.get('name'),
        target_amount=float(data.get('target_amount', 0)),
        current_amount=float(data.get('current_amount', 0)),
        target_date=target_date,
        created_at=datetime.utcnow(),
        icon=data.get('icon', '🎯')
    )
    db.session.add(new_goal)
    db.session.commit()
    return jsonify({"message": "Goal added"}), 201

@api_bp.route('/goals', methods=['GET'])
@jwt_required()
def get_goals():
    user_id = get_jwt_identity()
    
    # Fetch surplus for comparing
    surplus_data = _compute_surplus(user_id)
    surplus = surplus_data.get("surplus", 0)
    
    goals = Goal.query.filter_by(user_id=user_id).order_by(Goal.created_at.desc()).all()
    res = []
    import math
    for g in goals:
        target = float(g.target_amount or 0)
        current = float(g.current_amount or 0)
        remaining = max(0.0, target - current)
        
        now = datetime.utcnow()
        created = g.created_at or now

        # Compute days based on exact times
        total_days = 0 
        days_left = 0
        if g.target_date:
            total_days = max(1, (g.target_date - created).days)
            days_left = max(0, (g.target_date - now).days)
            
        elapsed_days = max(0, (now - created).days)
        
        total_months = max(1, math.ceil(total_days / 30.44))
        months_left = max(1, math.ceil(days_left / 30.44))
        elapsed_full_months = math.floor(elapsed_days / 30.44)
        
        monthly_required = remaining / months_left if remaining > 0 else 0
        
        # Expected savings so far (they only fall behind after a full month passes without saving)
        # Using continuous progress to detect 'Ahead' status
        expected_savings = (target / total_months) * elapsed_full_months
        continuous_expected = target * (elapsed_days / total_days) if total_days > 0 else target
        
        if target > 0:
            money_progress = (current / target) * 100
        else:
            money_progress = 0
            
        time_progress = (elapsed_days / total_days * 100) if total_days > 0 else 0
        
        status = "On Track"
        suggestion = "Keep up the good work!"
        
        if current >= target:
            status = "Completed"
            suggestion = "Goal achieved! 🎉"
        elif current < expected_savings or surplus < monthly_required:
            status = "Behind"
            catchup_amount = (remaining / months_left) + monthly_required
            suggestion = f"You're behind! Save ₹{catchup_amount:.0f} extra THIS month to get back on track."
        elif current > expected_savings + (target / total_months) or (money_progress > time_progress + 10):
            status = "Ahead"
            suggestion = "You're ahead of schedule! Consider investing the excess."
        elif current < target:
            suggestion = f"Save ₹{monthly_required:.0f} per month to stay on track."
        
        res.append({
            "id": g.id,
            "name": g.name,
            "icon": g.icon or '🎯',
            "target_amount": target,
            "current_amount": current,
            "remaining_amount": remaining,
            "progress_percentage": min(money_progress, 100),
            "monthly_required": monthly_required,
            "months_left": months_left,
            "status": status,
            "suggestion": suggestion
        })
    return jsonify(res), 200

@api_bp.route('/goals/<int:goal_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def manage_goal(goal_id):
    user_id = get_jwt_identity()
    g = Goal.query.filter_by(id=goal_id, user_id=user_id).first()
    if not g:
        return jsonify({"msg": "Goal not found"}), 404
        
    if request.method == 'DELETE':
        db.session.delete(g)
        db.session.commit()
        return jsonify({"message": "Goal deleted"}), 200
        
    # PUT logic for update-goal
    data = request.json
    if 'name' in data:
        g.name = data['name']
    if 'target_amount' in data:
        g.target_amount = float(data['target_amount'])
    if 'duration_months' in data:
        dm = int(data['duration_months'])
        g.target_date = datetime.utcnow() + timedelta(days=30 * dm)
    if 'icon' in data:
        g.icon = data['icon']
    
    db.session.commit()
    return jsonify({"message": "Goal updated"}), 200

@api_bp.route('/goals/<int:goal_id>/add-savings', methods=['POST'])
@jwt_required()
def add_goal_savings(goal_id):
    user_id = get_jwt_identity()
    data = request.json
    amount = float(data.get('amount', 0))
    from_balance = data.get('from_balance', False)
    date_str = data.get('date', None)
    
    g = Goal.query.filter_by(id=goal_id, user_id=user_id).first()
    if not g:
        return jsonify({"msg": "Goal not found"}), 404
        
    g.current_amount += amount

    savings_date = datetime.utcnow()
    if date_str:
        try:
            savings_date = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            pass

    # Save to history table
    gs = GoalSavings(goal_id=g.id, amount=amount, date=savings_date)
    db.session.add(gs)
    
    if from_balance:
        # Create a transaction
        tx = Transaction(
            user_id=user_id,
            amount=amount,
            merchant=f"[Goal: {g.name}]",
            category="Savings",
            type="expense",
            description="Goal Contribution",
            date=datetime.utcnow(),
            linked_goal_id=g.id
        )
        db.session.add(tx)
        
    db.session.commit()
    return jsonify({"message": "Savings added successfully", "current_amount": g.current_amount}), 200

@api_bp.route('/financial-health', methods=['GET'])
@jwt_required()
def financial_health():
    user_id = get_jwt_identity()
    data = _compute_surplus(user_id)
    surplus = data.get("surplus", 0)
    income = data.get("income", 50000)
    
    expenses = data.get("expenses", 0)
    
    score = 0
    if income > 0:
        savings_rate = surplus / income
        score = max(0, min(100, int(savings_rate * 100)))
            
    return jsonify({
        "score": score,
        "status": "Excellent" if score >= 80 else "Good" if score >= 50 else "Average" if score >= 20 else "Needs Improvement"
    }), 200

def _get_portfolio_summary(user_id):
    investments = Investment.query.filter_by(user_id=user_id).all()
    total_invested = 0
    total_current_value = 0
    holdings = []
    
    for inv in investments:
        current_price, price_error, currency = _fetch_yf_price_and_currency(inv.symbol)
        
        if current_price is None:
            current_price = inv.purchase_price
            
        cv = inv.quantity * current_price
        iv = inv.quantity * inv.purchase_price
        
        if currency != "USD":
            total_invested += iv
            total_current_value += cv
            
            holdings.append({
                "symbol": inv.symbol,
                "profit_loss": cv - iv,
                "pct_change": ((cv - iv) / iv * 100) if iv > 0 else 0
            })
        
    worst_performer = min(holdings, key=lambda x: x["profit_loss"]) if holdings else None
    
    return {
        "total_invested": total_invested,
        "total_value": total_current_value,
        "total_pl": total_current_value - total_invested,
        "worst_performer": worst_performer,
        "count": len(holdings)
    }

@api_bp.route('/chat', methods=['POST'])
@jwt_required()
def chat():
    user_id = get_jwt_identity()
    data = request.json
    message = data.get('message', '').lower()
    
    # Fetch Core Data
    user_data = _compute_surplus(user_id)
    surplus = user_data.get("surplus", 0)
    income = user_data.get("income", 0)
    expenses = user_data.get("expenses", 0)
    
    # Check for empty data
    transactions = Transaction.query.filter_by(user_id=user_id).first()
    if not transactions:
        return jsonify({"reply": "I'd love to help, but I don't see any transactions yet! 📊 Upload some data to get started."}), 200

    reply = "I can help with investments, savings, or spending insights. Try asking about your portfolio or savings!"

    # Intent Classification
    is_loss = any(k in message for k in ["loss", "negative", "losing", "worst stock", "losing money"])
    is_invest = any(k in message for k in ["which stocks", "where to invest", "suggestion", "invest", "investment", "buy"])
    is_portfolio = any(k in message for k in ["portfolio", "my holdings", "current holdings", "how much invested", "holdings summary"])
    is_savings = any(k in message for k in ["save", "savings", "saved", "total saved", "leftover", "income", "earned", "salary", "earn"])
    is_spending = any(k in message for k in ["spending", "overspend", "category", "where am i spending", "most spent", "expense", "spent", "spend"])

    # Month detection
    import calendar
    from datetime import datetime
    now = datetime.utcnow()
    target_month = now.month
    target_year = now.year
    months = {calendar.month_name[i].lower(): i for i in range(1, 13)}
    month_name_str = "this month"
    for m_name, m_num in months.items():
        if m_name in message:
            target_month = m_num
            month_name_str = f"in {m_name.capitalize()}"
            if target_month > now.month:
                target_year = now.year - 1
            break

    if is_loss:
        # Loss Analysis - PROPRIETIZE THIS
        p = _get_portfolio_summary(user_id)
        if p["count"] == 0:
            reply = "No stock-level data available yet. Please add your holdings in the 'Invest' tab to track performance."
        elif p["worst_performer"] and p["worst_performer"]["profit_loss"] < 0:
            w = p["worst_performer"]
            reply = f"Your worst performer is {w['symbol']}, which is currently down ₹{abs(w['profit_loss']):.0f} ({w['pct_change']:.1f}%). It might be worth reviewing this position. 📉"
        else:
            reply = "Great news! All your current holdings are in the green or flat. You don't have any individual losses to worry about right now. ✅"

    elif is_invest:
        # Investment Suggestions
        import random
        suggested = surplus * 0.2 if surplus > 0 else 0
        templates = [
            f"With your current surplus of ₹{surplus:.0f}, I suggest allocating ₹{suggested:.0f} to a balanced NIFTY 50 Index Fund for long-term growth.",
            f"Based on your ₹{surplus:.0f} leftover, putting ₹{suggested:.0f} into diversified mutual funds is a smart move right now! 🚀",
            f"You have ₹{surplus:.0f} available. A solid plan would be ₹{suggested:.0f} in an index fund and the rest in an emergency fund for extra security."
        ]
        reply = random.choice(templates) if surplus > 0 else "It's best to build an emergency fund first as you have no surplus this month. Focus on consistent saving first!"

    elif is_portfolio:
        # Portfolio Summary
        p = _get_portfolio_summary(user_id)
        if p["count"] > 0:
            reply = f"Your current portfolio overview: ₹{p['total_invested']:.0f} invested, with a current market value of ₹{p['total_value']:.0f} (Net: ₹{p['total_pl']:.0f})."
        else:
            reply = f"You haven't added any stocks yet. You currently have a ₹{surplus:.0f} surplus that you can start investing gradually into safe options."

    elif is_spending:
        # Spending Analysis
        txs = Transaction.query.filter_by(user_id=user_id).all()
        curr_month_tx = [t for t in txs if t.date.month == target_month and t.date.year == target_year and t.type.lower() in ['expense', 'debit', 'shopping', 'food', 'utilities', 'groceries', 'transportation']]
        
        cat_totals = {}
        total_exp = 0
        for t in curr_month_tx:
            category = t.category or "General"
            cat_totals[category] = cat_totals.get(category, 0) + t.amount
            total_exp += t.amount
            
        top_cat = max(cat_totals, key=cat_totals.get) if cat_totals else None
        top_amt = cat_totals[top_cat] if top_cat else 0
        
        if top_cat:
            reply = f"You've spent ₹{total_exp:.0f} {month_name_str}. You spent the most on {top_cat} (₹{top_amt:.0f}). Reducing this by even 10% could really boost your savings! 📉"
        else:
            if month_name_str == "this month":
                reply = "I don't have enough spending data for this month yet. Try adding some expenses first or check your recent insights."
            else:
                reply = f"I don't have any spending data recorded {month_name_str}."

    elif is_savings:
        # Savings Calculation (Month specific)
        txs = Transaction.query.filter_by(user_id=user_id).all()
        curr_month_inc = sum(t.amount for t in txs if t.date.month == target_month and t.date.year == target_year and t.type.lower() in ['income', 'credit'])
        curr_month_exp = sum(t.amount for t in txs if t.date.month == target_month and t.date.year == target_year and t.type.lower() in ['expense', 'debit', 'shopping', 'food', 'utilities', 'groceries', 'transportation'])
        month_saved = curr_month_inc - curr_month_exp
        
        if curr_month_inc == 0 and curr_month_exp == 0:
            if month_name_str == "this month":
                reply = "You haven't recorded any income or expenses this month yet! Start tracking to see your savings."
            else:
                reply = f"I don't have any data recorded {month_name_str}."
        else:
            display_month = month_name_str.replace('in ', '').replace('this month', 'this month')
            reply = f"For {display_month}, your income is ₹{curr_month_inc:.0f} and expenses are ₹{curr_month_exp:.0f}. You've saved ₹{month_saved:.0f}! 💰"

    elif any(k in message for k in ["trend", "spending trend", "compare"]):
        # Fallback to general data-driven trend if matched
        now = datetime.utcnow()
        transactions = Transaction.query.filter_by(user_id=user_id).all()
        prev_m = (now.month - 1) if now.month > 1 else 12
        prev_y = now.year if now.month > 1 else now.year - 1
        curr_exp = sum(t.amount for t in transactions if t.date.month == now.month and t.date.year == now.year and t.type.lower() in ['expense', 'debit'])
        prev_exp = sum(t.amount for t in transactions if t.date.month == prev_m and t.date.year == prev_y and t.type.lower() in ['expense', 'debit'])
        
        if prev_exp > 0:
            diff = ((curr_exp - prev_exp) / prev_exp) * 100
            trend = "increased" if diff > 0 else "decreased"
            reply = f"Your spending {trend} by {abs(diff):.1f}% this month compared to last month."
        else:
            reply = f"You've spent ₹{curr_exp:.0f} this month. I'll need another month of data to show you a trend!"

    return jsonify({"reply": reply}), 200
