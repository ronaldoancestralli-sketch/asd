(() => {
  const avatar = document.getElementById('account-avatar');
  if (!avatar) return;
  avatar.hidden = true;
  document.body.appendChild(avatar);
})();
