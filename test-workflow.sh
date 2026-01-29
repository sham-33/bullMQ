#!/bin/bash

BASE_URL="http://localhost:3000"

echo "1. Creating Workflow Definition..."
RESPONSE=$(curl -s -X POST "$BASE_URL/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "onboarding-flow",
    "steps": [
      { "type": "LOG", "payload": { "message": "Starting onboarding" } },
      { "type": "DELAY", "payload": { "seconds": 2 } },
      { "type": "SEND_EMAIL", "payload": { "to": "newuser@example.com", "template": "welcome" } },
      { "type": "HTTP_CALL", "payload": { "url": "https://api.example.com/hooks" } }
    ]
  }')

echo "Response: $RESPONSE"
ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ID" ]; then
  echo "Failed to create workflow"
  exit 1
fi

echo "Created Workflow ID: $ID"
echo ""

echo "2. Triggering Execution..."
EXEC_RESPONSE=$(curl -s -X POST "$BASE_URL/workflows/$ID/execute")
echo "Response: $EXEC_RESPONSE"
EXEC_ID=$(echo $EXEC_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$EXEC_ID" ]; then
  echo "Failed to start execution"
  exit 1
fi

echo "Execution ID: $EXEC_ID"
echo ""

echo "3. Polling Status..."
STATUS="PENDING"
while [ "$STATUS" != "COMPLETED" ] && [ "$STATUS" != "FAILED" ]; do
  sleep 1
  STATUS_RES=$(curl -s "$BASE_URL/workflows/executions/$EXEC_ID")
  STATUS=$(echo $STATUS_RES | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  CURRENT_STEP=$(echo $STATUS_RES | grep -o '"currentStepIndex":[^,]*' | cut -d':' -f2)
  echo "Status: $STATUS, Step Index: $CURRENT_STEP"
done

echo ""
echo "Final Status: $STATUS"
curl -s "$BASE_URL/workflows/executions/$EXEC_ID" | python3 -m json.tool
