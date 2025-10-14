from pwdlib import PasswordHash

pwd_hash = PasswordHash.recommended()


class Hash:
    @staticmethod
    def encrypt(password: str) -> str:
        return pwd_hash.hash(password)

    @staticmethod
    def verify(plain_password: str, hashed_password: str) -> bool:
        return pwd_hash.verify(plain_password, hashed_password)
