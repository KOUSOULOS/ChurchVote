$envFile = '.\.env.local'
$apiKey = (Get-Content $envFile | Where-Object { $_ -match '^VITE_FIREBASE_API_KEY=' }) -replace '^VITE_FIREBASE_API_KEY=', ''
$projectId = (Get-Content $envFile | Where-Object { $_ -match '^VITE_FIREBASE_PROJECT_ID=' }) -replace '^VITE_FIREBASE_PROJECT_ID=', ''
$appId = 'church-vote-production'
$referer = 'https://churchvote-ba9c1.web.app'
Write-Output "Using project=$projectId appId=$appId apiKey=$($apiKey.Substring(0,8))..."

$pollsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/polls?key=$apiKey"
Write-Output "Querying polls: $pollsUrl"
try { $polls = Invoke-RestMethod -Method Get -Uri $pollsUrl } catch { Write-Error "Failed to query polls: $_"; exit 1 }

if (-not $polls.documents) { Write-Error "No polls found in path artifacts/$appId/public/data/polls"; exit 1 }

$first = $polls.documents[0]
$docName = $first.name
$components = $docName -split '/'
$pollId = $components[-1]
Write-Output "Found pollId=$pollId"

# Anonymous sign-up via Identity Toolkit with Referer + Origin headers
$signupUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey"
Write-Output "Signing up anonymously with Referer header..."
try {
  $signup = Invoke-RestMethod -Method Post -Uri $signupUrl -Body '{}' -ContentType 'application/json' -Headers @{ Referer = $referer; Origin = $referer }
} catch {
  Write-Error "Anonymous sign-up failed: $_"
  exit 1
}
Write-Output "Signed up anon: uid=$($signup.localId)"

# Prepare vote document
$uid = $signup.localId
$now = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
$docPath = "projects/$projectId/databases/(default)/documents/artifacts/$appId/public/data/poll_${pollId}_votes/$uid"
$voteBody = @{ fields = @{ userId = @{ stringValue = $uid }; method = @{ stringValue = 'anonymous' }; votedAt = @{ timestampValue = $now }; selections = @{ mapValue = @{ fields = @{ '0' = @{ integerValue = '1' } } } } } }
$bodyJson = $voteBody | ConvertTo-Json -Depth 10
Write-Output "Submitting vote to $docPath"
try {
  $resp = Invoke-RestMethod -Method Patch -Uri "https://firestore.googleapis.com/v1/$docPath" -Headers @{ Authorization = "Bearer $($signup.idToken)"; Referer = $referer; Origin = $referer } -Body $bodyJson -ContentType 'application/json'
  Write-Output "Vote submitted: $($resp.name)"
} catch {
  Write-Error "Failed to submit vote: $_"
  if ($_.Exception.Response) { try { $_.Exception.Response.GetResponseStream() | % { new-object System.IO.StreamReader($_) } | % { $_.ReadToEnd() } } catch {} }
  exit 1
}

# Verify vote exists by reading
$verifyUrl = "https://firestore.googleapis.com/v1/$docPath?key=$apiKey"
try {
  $check = Invoke-RestMethod -Method Get -Uri "https://firestore.googleapis.com/v1/$docPath" -Headers @{ Authorization = "Bearer $($signup.idToken)"; Referer = $referer; Origin = $referer }
  Write-Output "Verified vote doc fields:"
  $check.fields | ConvertTo-Json -Depth 5 | Write-Output
} catch {
  Write-Error "Failed to verify vote: $_"
  exit 1
}
