import json, sys, soundfile as sf
from kokoro_onnx import Kokoro
SP = sys.argv[1]
voice = sys.argv[2] if len(sys.argv) > 2 else "af_heart"
speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.05
k = Kokoro(f"{SP}/tts/kokoro-v1.0.onnx", f"{SP}/tts/voices-v1.0.bin")
lines = [
  ("hook1", "Job hunting is a full-time job."),
  ("hook2", "Let JobWatch do the busywork."),
  ("setup1", "Sign in, pick your role, your city, and your pay floor."),
  ("setup2", "Choose instant, daily, or weekly alerts, by email, Telegram, or Discord."),
  ("find1", "New matches arrive on your schedule."),
  ("find2", "Or tap Find jobs now, and get a brief in your inbox."),
  ("swipe1", "Swipe to sort: apply, maybe, or pass."),
  ("swipe2", "Super Apply adds a twenty-four-hour timer."),
  ("pay", "Every job shows pay. Posted, or a clearly labelled estimate."),
  ("track", "Track every application, from saved to offer."),
  ("kit", "Then your application kit matches your résumé to the job, writes your cover letter and tailored résumé in Word, finds the recruiter's email, and drafts your follow-up and thank-you notes."),
  ("prep", "It even preps you for a voice mock interview in ChatGPT, Claude, Gemini, or Grok."),
  ("safe1", "Your data is stored in Canada, encrypted, and never sold."),
  ("safe2", "Delete it anytime."),
  ("cta", "JobWatch. Your whole job search, in one free place."),
]
out = {}
for key, text in lines:
    samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(f"{SP}/promo/vo/{key}.wav", samples, sr)
    out[key] = round(len(samples) / sr, 3)
    print(key, out[key], flush=True)
json.dump({"voice": voice, "speed": speed, "sr": sr, "dur": out}, open(f"{SP}/promo/vo/durations.json", "w"), indent=1)
print("total speech", round(sum(out.values()), 2))
