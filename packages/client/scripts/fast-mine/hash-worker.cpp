#include <gmp.h>
#include <array>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

class PlanetHasher {
 public:
  explicit PlanetHasher(const char* constantsPath) {
    mpz_inits(p_, limit_, l_, r_, firstL_, firstR_, t_, square_, fourth_, next_, nullptr);
    mpz_set_str(p_, "21888242871839275222246405745257275088548364400416034343698204186575808495617", 10);
    mpz_fdiv_q_ui(limit_, p_, 16384);
    std::ifstream file(constantsPath);
    for (auto& constant : constants_) {
      mpz_init(constant);
      std::string value;
      if (!(file >> value) || mpz_set_str(constant, value.c_str(), 10) != 0) {
        throw std::runtime_error("Invalid MiMC constants");
      }
      mpz_add_ui(constant, constant, 1729);
      if (mpz_cmp(constant, p_) >= 0) mpz_sub(constant, constant, p_);
    }
  }

  ~PlanetHasher() {
    for (auto& constant : constants_) mpz_clear(constant);
    mpz_clears(p_, limit_, l_, r_, firstL_, firstR_, t_, square_, fourth_, next_, nullptr);
  }

  void beginX(int x) {
    mpz_set_si(l_, x);
    if (x < 0) mpz_add(l_, l_, p_);
    mpz_set_ui(r_, 0);
    mix(false);
    mpz_set(firstL_, l_);
    mpz_set(firstR_, r_);
  }

  bool hashY(int y, char* output) {
    mpz_set(l_, firstL_);
    mpz_set(r_, firstR_);
    mpz_set_si(t_, y);
    mpz_add(l_, l_, t_);
    if (mpz_sgn(l_) < 0) mpz_add(l_, l_, p_);
    if (mpz_cmp(l_, p_) >= 0) mpz_sub(l_, l_, p_);
    mix(true);
    if (mpz_cmp(l_, limit_) >= 0) return false;
    mpz_get_str(output, 16, l_);
    return true;
  }

 private:
  void power5() {
    mpz_mul(square_, t_, t_); mpz_mod(square_, square_, p_);
    mpz_mul(fourth_, square_, square_); mpz_mod(fourth_, fourth_, p_);
    mpz_mul(next_, fourth_, t_); mpz_mod(next_, next_, p_);
  }

  void mix(bool finalInput) {
    for (int i = 0; i < 999; ++i) {
      mpz_add(t_, l_, constants_[i]);
      if (mpz_cmp(t_, p_) >= 0) mpz_sub(t_, t_, p_);
      power5(); mpz_add(next_, next_, r_);
      if (mpz_cmp(next_, p_) >= 0) mpz_sub(next_, next_, p_);
      mpz_swap(r_, l_); mpz_swap(l_, next_);
    }
    if (!finalInput) {
      mpz_add_ui(t_, l_, 1729);
      if (mpz_cmp(t_, p_) >= 0) mpz_sub(t_, t_, p_);
      power5(); mpz_add(r_, next_, r_);
      if (mpz_cmp(r_, p_) >= 0) mpz_sub(r_, r_, p_);
    }
  }

  mpz_t p_, limit_, l_, r_, firstL_, firstR_, t_, square_, fourth_, next_;
  std::array<mpz_t, 999> constants_;
};

int main(int argc, char** argv) {
  if (argc != 2) return 2;
  try {
    PlanetHasher hasher(argv[1]);
    int id, x, y, size;
    while (std::cin >> id >> x >> y >> size) {
      if (size != 16) return 3;
      std::cout << "{\"id\":" << id << ",\"x\":" << x
                << ",\"y\":" << y << ",\"s\":" << size << ",\"hits\":[";
      bool first = true;
      for (int px = x; px < x + size; ++px) {
        hasher.beginX(px);
        for (int py = y; py < y + size; ++py) {
          char hex[80];
          if (!hasher.hashY(py, hex)) continue;
          if (!first) std::cout << ',';
          first = false;
          std::cout << '[' << px << ',' << py << ",\"" << std::setw(64)
                    << std::setfill('0') << hex << "\"]";
        }
      }
      std::cout << "]}" << std::endl;
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
